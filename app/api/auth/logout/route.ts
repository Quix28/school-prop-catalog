import { cookies } from 'next/headers'
import { destroySession, handler, SESSION_COOKIE } from '@/lib/auth'

export function POST() {
  return handler(async () => {
    const jar = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    // Delete the row too, not just the cookie — otherwise the token stays valid if copied.
    if (token) destroySession(token)
    jar.delete(SESSION_COOKIE)
    return Response.json({ ok: true })
  })
}
