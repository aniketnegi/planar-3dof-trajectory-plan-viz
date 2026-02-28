import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        // Any request from the browser to /api/anything...
        source: "/api/:path*",
        // ...will be secretly proxied by the Next.js server to your FastAPI container
        // Note: 'api' is the service name from the docker-compose.yml
        destination: `${process.env.INTERNAL_API_URL || "http://api:80"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
