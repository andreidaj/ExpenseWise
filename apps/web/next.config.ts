import type { NextConfig } from "next";

const apiInternal = (process.env.API_INTERNAL_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${apiInternal}/api/:path*` },
        { source: "/mcp", destination: `${apiInternal}/mcp` },
        { source: "/mcp/:path*", destination: `${apiInternal}/mcp/:path*` },
        { source: "/oauth", destination: `${apiInternal}/oauth` },
        { source: "/oauth/:path*", destination: `${apiInternal}/oauth/:path*` },
        { source: "/.well-known", destination: `${apiInternal}/.well-known` },
        { source: "/.well-known/:path*", destination: `${apiInternal}/.well-known/:path*` },
      ],
    };
  },
};

export default nextConfig;
