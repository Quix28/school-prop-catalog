import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { UPLOAD_DIR } from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'

const MAX_BYTES = 8 * 1024 * 1024
// Allow-list, not a block-list: an SVG can carry script, so it is deliberately excluded.
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function POST(req: Request) {
  return handler(async () => {
    await requireAdmin()

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: 'Image must be 8 MB or smaller' }, { status: 413 })
    }

    const ext = EXT_BY_TYPE[file.type]
    if (!ext) {
      return Response.json({ error: 'Only JPEG, PNG, WebP or GIF images are allowed' },
        { status: 415 })
    }

    // The filename is generated here and the extension comes from the sniffed MIME type —
    // the client's original name is never used, so it cannot smuggle a path or a bad suffix.
    const filename = `${randomUUID()}.${ext}`
    await writeFile(join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()))

    return Response.json({ url: `/api/uploads/${filename}` }, { status: 201 })
  })
}
