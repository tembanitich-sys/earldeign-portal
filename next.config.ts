import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer"],
  // PDF fonts are read from disk at runtime, so make sure they ship with the serverless function.
  outputFileTracingIncludes: { "/api/pdf/**": ["./node_modules/@fontsource/inter/files/inter-latin-*-normal.woff"] },
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
};

export default nextConfig;
