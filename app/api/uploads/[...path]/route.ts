import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, normalize, extname } from 'node:path'
import { Readable } from 'node:stream'
import { UPLOAD_DIR } from '@/lib/db'
import { handler } from '@/lib/auth'

const TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

// Public on purpose: <img> tags cannot send credentials, and these are photos of school props.
export function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handler(async () => {
    const { path } = await params

    // Resolve, then confirm the result is still inside UPLOAD_DIR. Without this check a
    // request for ../../etc/passwd would escape the directory.
    const target = normalize(join(UPLOAD_DIR, ...path))
    if (!target.startsWith(UPLOAD_DIR)) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const info = await stat(target).catch(() => null)
    if (!info?.isFile()) return Response.json({ error: 'Not found' }, { status: 404 })

    const type = TYPE_BY_EXT[extname(target).toLowerCase()]
    if (!type) return Response.json({ error: 'Not found' }, { status: 404 })

    const stream = Readable.toWeb(createReadStream(target)) as ReadableStream
    return new Response(stream, {
      headers: {
        'Content-Type': type,
        'Content-Length': String(info.size),
        // Filenames are random UUIDs, so a file's contents never change under a given URL.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  })
}
