import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // knowledge/ JSON is outside web-app, allow imports
  transpilePackages: [],
  env: {
    KNOWLEDGE_PROJECT: process.env.KNOWLEDGE_PROJECT || "Pydantic AI",
  },
};

export default nextConfig;
