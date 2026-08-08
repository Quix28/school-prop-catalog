import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
