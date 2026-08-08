import { getUser, handler } from '@/lib/auth'

// Replaces supabase.auth.getUser(). Returns { user: null } rather than 401 so pages can
// decide to redirect without treating "signed out" as an error.
export function GET() {
  return handler(async () => Response.json({ user: await getUser() }))
}
