/**
 * Minimal fixed-window rate limiter for the login endpoint.
 *
 * ponytail: in-memory Map, so counters reset when the process restarts and are per-process.
 * That is fine for one Next server on one Pi. If this ever runs behind multiple workers or
 * needs to survive restarts, move the counters into a SQLite table keyed the same way.
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

/** Called after a successful login so one good attempt clears the failure count. */
export function resetLimit(key: string) {
  buckets.delete(key)
}

/**
 * Best-effort client IP. Behind a reverse proxy the socket address is the proxy, so we read
 * the forwarded headers it sets. These are spoofable if the app is reachable directly —
 * which is why the limiter keys on IP *and* email rather than IP alone.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

// Keep the map from growing without bound if the process runs for months.
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
}, 60 * 60_000).unref?.()
