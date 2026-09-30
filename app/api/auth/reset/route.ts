import { handler, MIN_PASSWORD_LENGTH } from '@/lib/auth'
import { resetPassword } from '@/lib/verification'

/** POSTed by /reset-password; the emailed link only opens that page. */
export function POST(req: Request) {
  return handler(async () => {
    const { token, password } = await req.json().catch(() => ({}))
    if (typeof token !== 'string' || !token || typeof password !== 'string') {
      return Response.json({ error: 'Token and password are required' }, { status: 400 })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return Response.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 })
    }

    // No session is created: the user signs in with the new password, on whichever page
    // (student or admin) they use.
    if (!(await resetPassword(token, password))) {
      return Response.json({ error: 'This link is no longer valid.', invalid: true }, { status: 410 })
    }
    return Response.json({ ok: true })
  })
}
