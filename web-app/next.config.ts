import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/chapters/:id",
        destination: "/books/claude-code/chapters/:id",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
