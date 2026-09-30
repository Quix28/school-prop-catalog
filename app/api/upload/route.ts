import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { UPLOAD_DIR } from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'
import { sniffImageExt } from '@/lib/images'

const MAX_BYTES = 8 * 1024 * 1024

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

    const bytes = Buffer.from(await file.arrayBuffer())
    const ext = sniffImageExt(bytes)
    if (!ext) {
      return Response.json({ error: 'Only JPEG, PNG, WebP or GIF images are allowed' },
        { status: 415 })
    }

    // Server-made name, extension from the bytes: nothing from the client reaches the path.
    const filename = `${randomUUID()}.${ext}`
    await writeFile(join(/* turbopackIgnore: true */ UPLOAD_DIR, filename), bytes)

    return Response.json({ url: `/api/uploads/${filename}` }, { status: 201 })
  })
}
