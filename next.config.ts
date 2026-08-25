import type { NextConfig } from "next";

const apiOrigin = (
  process.env.NEXT_PUBLIC_API_URL_LOCAL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:3001/v1"
)
  .replace(/\/v1\/?$/i, "");

const nextConfig: NextConfig = {
  // Live deploys must not fail on lint; keep CI/local `next lint` for quality.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      {
        source: "/v1/uploads/:path*",
        destination: `${apiOrigin}/v1/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
