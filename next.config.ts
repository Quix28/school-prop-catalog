import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Dev needs 'unsafe-eval'/'unsafe-inline' for HMR; production keeps script-src tight.
// Next inlines a small hydration bootstrap script, so 'unsafe-inline' on script-src stays
// even in prod — a nonce-based CSP would need middleware; this still blocks external script
// injection, framing, and MIME sniffing, which are the real risks here.
const csp = [
  "default-src 'self'",
  isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS only over TLS — sending it on plain http:// (dev) would pin an unreachable https origin.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

// Uploaded photos, served from the app's own origin. A polyglot file (valid GIF header plus
// markup) must never run as a page: no sniffing, download instead of render if opened
// directly (<img> ignores Content-Disposition), and a sandbox with no script if it ever does
// reach a document context. These must be set here, not in the route: Next drops a route's
// header when a headers() rule already sets the same name. The later rule wins.
const uploadHeaders = [
  { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
  { key: "Content-Disposition", value: "attachment" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/uploads/:path*", headers: uploadHeaders },
    ];
  },
  // Ship a self-contained server so the Pi only needs the build output, not the full
  // node_modules tree. Lets you build on a faster machine and rsync the result over.
  output: "standalone",
  // better-sqlite3 is a native .node binding — it must stay a real require() and not be
  // bundled, or the server build fails.
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // These pages are prerendered as static, and the client router cache keeps static
    // segments for 5 minutes by default. That restores the cached React tree on navigation
    // without remounting, so the pages' load-on-mount effects never re-run and the UI shows
    // stale data until a hard reload. Everything here is live inventory — never cache it.
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
