// Fetch wrapper; throws the server's error message on non-2xx.

/** `data` holds the rest of the error body, e.g. `unverified`. */
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
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
  upload: <T>(url: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<T>(url, { method: 'POST', body: form })
  },
}

export const errorMessage = (e: unknown) => e instanceof Error ? e.message : String(e)

/** Today in local time, as YYYY-MM-DD. */
export const localToday = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

/** Parses SQLite's zone-less UTC datetime; ISO strings pass through. */
export const fromSqlTime = (s: string) =>
  new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s)

export type SessionUser = {
  id: string
  email: string
  full_name: string | null
  role: 'student' | 'admin'
}

export const getCurrentUser = () =>
  api.get<{ user: SessionUser | null }>('/api/auth/me').then(r => r.user).catch(() => null)

export const signOut = () => api.post('/api/auth/logout').catch(() => undefined)
