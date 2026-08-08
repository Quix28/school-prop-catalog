import { cookies } from 'next/headers'
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'
import { consumeVerificationToken } from '@/lib/verification'

/**
 * Opened from the confirmation email, so it must be a plain GET that works in any mail
 * client. Redirects to a page rather than returning JSON.
 */
export async function GET(req: Request) {
  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '')
  const token = new URL(req.url).searchParams.get('token') || ''

  const profile = token ? consumeVerificationToken(token) : null
  if (!profile) {
    // Expired, already used, or forged — all the same to the visitor.
    return Response.redirect(`${base}/verify?status=invalid`, 303)
  }

  // Confirming proves inbox access, so signing them in here is safe and saves a step.
  const { token: sessionToken, expires } = createSession(profile.id)
  ;(await cookies()).set(SESSION_COOKIE, sessionToken, sessionCookieOptions(expires))

  return Response.redirect(`${base}/verify?status=ok`, 303)
}
