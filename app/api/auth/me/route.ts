import { getUser, handler } from '@/lib/auth'

// { user: null } when signed out, not a 401.
export function GET() {
  return handler(async () => Response.json({ user: await getUser() }))
}
