import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./content/**/*", "./words/**/*", "./drizzle/**/*"],
  },
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  async redirects() {
    return [
      {
        source: "/units",
        destination: "/library",
        permanent: true,
      },
      {
        source: "/units/:path*",
        destination: "/library/:path*",
        permanent: true,
      },
      {
        source: "/chat",
        destination: "/library",
        permanent: true,
      },
      {
        source: "/chat/:path*",
        destination: "/library",
        permanent: true,
      },
      {
        source: "/markdown",
        destination: "/library",
        permanent: true,
      },
      {
        source: "/markdown/:path*",
        destination: "/library",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
