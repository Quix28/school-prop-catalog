import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Dev needs 'unsafe-eval' for HMR. 'unsafe-inline' stays in prod for Next's inline bootstrap
// script; nonces would need middleware.
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
  // HSTS only in production (HTTPS).
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

// Uploads must never run as a page: sandboxed, and downloaded if opened directly (<img>
// ignores that). Set here because Next drops route headers that headers() also sets;
// the later rule wins.
const uploadHeaders = [
  { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
  { key: "Content-Disposition", value: "attachment" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/uploads/:path*", headers: uploadHeaders },
    ];
  },
  // Self-contained server in .next/standalone, started by deploy/prop-catalog.service.
  output: "standalone",
  // Keep secrets, the local database and the repo out of that output.
  outputFileTracingExcludes: {
    "*": ["./data/**", "./.env*", "./.git/**", "./scripts/**", "./deploy/**", "./README.md"],
  },
  // Native module: must not be bundled.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
