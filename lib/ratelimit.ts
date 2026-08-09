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
 * Best-effort client IP. Forwarded headers are attacker-controlled unless a trusted proxy
 * sets them — if the app is reachable directly, anyone can rotate X-Forwarded-For to dodge
 * the limiter entirely. So we only read those headers when TRUST_PROXY=true (set it once a
 * reverse proxy like Caddy/nginx terminates in front). Otherwise every direct client keys to
 * the same 'unknown', which combined with the per-email key still throttles password guessing.
 */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const fwd = req.headers.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
    const real = req.headers.get('x-real-ip')
    if (real) return real
  }
  return 'unknown'
}

// Keep the map from growing without bound if the process runs for months.
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
}, 60 * 60_000).unref?.()
