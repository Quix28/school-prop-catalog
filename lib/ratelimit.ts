/**
 * Fixed-window rate limiter for the auth endpoints.
 * ponytail: in-memory, per process, reset on restart. Move to SQLite if that stops being enough.
 */
type Entry = { count: number; resetAt: number }

const buckets = new Map<string, Entry>()

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

export function rateLimit(key: string, limit = 8, windowMs = 10 * 60_000): RateLimitResult {
  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  entry.count += 1
  if (entry.count > limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { ok: true }
}

/** Call on success so only failures count. */
export function resetLimit(key: string) {
  buckets.delete(key)
}

/**
 * Client IP. Forwarded headers are trusted only with TRUST_PROXY=true, and only the rightmost
 * entry (added by our proxy); the rest can be forged. Otherwise every client is 'unknown'.
 */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const fwd = req.headers.get('x-forwarded-for')
    if (fwd) return fwd.split(',').at(-1)!.trim()
    const real = req.headers.get('x-real-ip')
    if (real) return real
  }
  return 'unknown'
}

// Prune expired entries hourly.
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
}, 60 * 60_000).unref?.()
