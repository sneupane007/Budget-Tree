import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the Playwright test server build into its own dir so it can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // proxy.ts buffers request bodies (default cap 10MB, truncating larger ones). Receipts allow
  // 10MB files, and multipart framing adds overhead, so leave headroom; the route enforces 10MB.
  experimental: { proxyClientMaxBodySize: "12mb" },
};

export default nextConfig;
