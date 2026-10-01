import { handler, requireAdmin } from '@/lib/auth'
import { parseSettings, saveSettings } from '@/lib/settings'

export function PUT(req: Request) {
  return handler(async () => {
    await requireAdmin()
    const parsed = parseSettings(await req.json().catch(() => ({})))
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })
    saveSettings(parsed.settings)
    return Response.json({ settings: parsed.settings })
  })
}
