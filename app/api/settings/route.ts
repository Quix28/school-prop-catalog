import { handler, requireAdmin, requireAdminCode } from '@/lib/auth'
import { parseSettings, saveSettings } from '@/lib/settings'

export function PUT(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin()
    const body = await req.json().catch(() => ({}))
    requireAdminCode(req, admin.id, body.code)
    const parsed = parseSettings(body)
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })
    saveSettings(parsed.settings)
    return Response.json({ settings: parsed.settings })
  })
}
