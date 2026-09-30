import { open, realpath } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'
import { Readable } from 'node:stream'
import { UPLOAD_DIR } from '@/lib/db'
import { handler } from '@/lib/auth'
import { TYPE_BY_EXT } from '@/lib/images'

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 })

// Public on purpose: <img> tags cannot send credentials, and these are photos of school props.
// The sandboxing headers for these responses live in next.config.ts: Next drops a route's own
// header when the global headers() rule already sets the same name.
export function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handler(async () => {
    const { path } = await params

    // Resolve symlinks, then confirm the result is still inside UPLOAD_DIR. Without this a
    // request for ../../etc/passwd — or a symlink placed in the folder — would escape it.
    // Match on a trailing separator so a sibling like `<DATA_DIR>/uploads-evil` cannot pass.
    const root = await realpath(UPLOAD_DIR)
    const target = await realpath(join(UPLOAD_DIR, ...path)).catch(() => null)
    if (!target?.startsWith(root + sep)) return notFound()

    const type = TYPE_BY_EXT[extname(target).slice(1).toLowerCase()]
    if (!type) return notFound()

    // Open first and stat the open handle, so a failure lands here as a 404 rather than
    // inside the stream after the headers (and a stale Content-Length) have gone out.
    const file = await open(target).catch(() => null)
    if (!file) return notFound()
    const info = await file.stat()
    if (!info.isFile()) { await file.close(); return notFound() }

    const headers = {
      'Content-Type': type,
      'Content-Length': String(info.size),
      // Filenames are random UUIDs, so a file's contents never change under a given URL.
      'Cache-Control': 'public, max-age=31536000, immutable',
    }

    // Next answers HEAD with this GET handler and discards the body unread, so a stream opened
    // for HEAD would never close its file descriptor.
    if (req.method === 'HEAD') {
      await file.close()
      return new Response(null, { headers })
    }
    return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream, { headers })
  })
}
