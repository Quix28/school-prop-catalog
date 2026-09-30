// Thin fetch wrapper so pages read almost like the old Supabase calls.
// Throws on non-2xx with the server's message, which the pages already surface to the user.

/** Thrown for a non-2xx reply; `data` keeps the rest of the body (e.g. `unverified`). */
export class ApiError extends Error {
  constructor(message: string, readonly data: Record<string, unknown> | null) {
    super(message)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData
      ? init?.headers
      : { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, data)
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
  upload: <T>(url: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<T>(url, { method: 'POST', body: form })
  },
}

/** Message of anything caught, for display. */
export const errorMessage = (e: unknown) => e instanceof Error ? e.message : String(e)

export type SessionUser = {
  id: string
  email: string
  full_name: string | null
  role: 'student' | 'admin'
}

/** Replaces supabase.auth.getUser(). */
export const getCurrentUser = () =>
  api.get<{ user: SessionUser | null }>('/api/auth/me').then(r => r.user).catch(() => null)

export const signOut = () => api.post('/api/auth/logout').catch(() => undefined)
