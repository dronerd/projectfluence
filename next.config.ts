import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Both routes resolve canonical vocabulary by filename at runtime. Include the
  // same source catalog in Vercel functions instead of creating another copy.
  outputFileTracingIncludes: {
    "/api/speakwise/learning": ["./public/vocabstream/data/**/*"],
    "/api/vocabstream/review": ["./public/vocabstream/data/**/*"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "react-router-dom": path.resolve(__dirname, "apps/vocabstream/src/lib/router-compat.tsx"),
    };

    return config;
  },
};

export default nextConfig;
