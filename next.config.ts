import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "react-router-dom": path.resolve(__dirname, "apps/vocabstream/src/lib/router-compat.tsx"),
    };

    return config;
  },
};

export default nextConfig;
