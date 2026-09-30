import { open, realpath } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'
import { Readable } from 'node:stream'
import { UPLOAD_DIR } from '@/lib/db'
import { handler } from '@/lib/auth'
import { TYPE_BY_EXT } from '@/lib/images'

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 })

// Public: photos of props, loaded by <img>. Security headers are set in next.config.ts.
export function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handler(async () => {
    const { path } = await params

    // Resolve symlinks, then require the path to stay inside UPLOAD_DIR.
    const root = await realpath(UPLOAD_DIR)
    const target = await realpath(join(UPLOAD_DIR, ...path)).catch(() => null)
    if (!target?.startsWith(root + sep)) return notFound()

    const type = TYPE_BY_EXT[extname(target).slice(1).toLowerCase()]
    if (!type) return notFound()

    // Open before stat so failures become a 404, not a broken stream.
    const file = await open(target).catch(() => null)
    if (!file) return notFound()
    const info = await file.stat()
    if (!info.isFile()) { await file.close(); return notFound() }

    const headers = {
      'Content-Type': type,
      'Content-Length': String(info.size),
      // UUID names never change content.
      'Cache-Control': 'public, max-age=31536000, immutable',
    }

    // HEAD runs this handler too; an unread stream would leak the file descriptor.
    if (req.method === 'HEAD') {
      await file.close()
      return new Response(null, { headers })
    }
    return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream, { headers })
  })
}
