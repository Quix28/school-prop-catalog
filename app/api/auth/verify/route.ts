import { cookies } from 'next/headers'
import { createSession, handler, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import { confirmAccount, hashToken } from '@/lib/verification'

/** Called by /verify. A POST, so mail scanners that open links can't spend the token. */
export function POST(req: Request) {
  return handler(async () => {
    const { token, password } = await req.json().catch(() => ({}))
    if (typeof token !== 'string' || !token || typeof password !== 'string') {
      return Response.json({ error: 'Token and password are required' }, { status: 400 })
    }

    // Per token: guessing needs the link.
    const limited = rateLimit(`verify:${hashToken(token)}`)
    if (!limited.ok) {
      return Response.json({ error: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
    }

    const result = await confirmAccount(token, password)
    if (result === 'invalid') {
      // Expired, used, replaced or forged.
      return Response.json({ error: 'This link is no longer valid.', invalid: true }, { status: 410 })
    }
    if (result === 'wrong_password') {
      return Response.json({
        error: 'That is not the password this account was created with. If you did not sign up '
          + 'with this address yourself, sign up again to replace that registration.',
      }, { status: 401 })
    }

    // Token plus password proves ownership: sign in.
    const { token: sessionToken, expires } = createSession(result.id)
    ;(await cookies()).set(SESSION_COOKIE, sessionToken, sessionCookieOptions(expires))
    return Response.json({ ok: true })
  })
}
