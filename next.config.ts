import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Ship a self-contained server so the Pi only needs the build output, not the full
  // node_modules tree. Lets you build on a faster machine and rsync the result over.
  output: "standalone",
  // better-sqlite3 is a native .node binding — it must stay a real require() and not be
  // bundled, or the server build fails.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
