import type { NextConfig } from "next";

const scriptSources = `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`;
const contentSecurityPolicy = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; ${scriptSources}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https://streaming.exclusive.radio https://d2ol7oe51mr4n9.cloudfront.net https://d8j0ntlcm91z4.cloudfront.net; connect-src 'self' http://127.0.0.1:* http://localhost:*; worker-src 'self' blob:`;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  webpack: (config) => {
    // Some Windows filesystems intermittently reject Webpack pack-cache writes.
    // Keep normal caching by default and expose a build-only recovery switch.
    if (process.env.KONKON_DISABLE_WEBPACK_CACHE === "1") config.cache = false;
    return config;
  },
  experimental: {
    // Bound build-time page workers on developer machines and small deployments.
    cpus: 2,
    optimizePackageImports: ["lucide-react"],
  },
  headers: async () => [
    {
      source: "/media/mascot/:asset(kona-mainframe-ai-2x-v9.mp4|kona-mainframe-original-v8.mp4|kona-mainframe-poster-v9.jpg)",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "Origin-Agent-Cluster", value: "?1" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(self), nfc=(self), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
      ],
    },
    {
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    {
      source: "/:path(login|setup|change-password|recover-owner|appeal|report|trust-center)",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    },
    {
      source: "/downloads/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
        { key: "Content-Disposition", value: "attachment" },
      ],
    },
    {
      source: "/:path(r|card-write)",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
      ],
    },
    {
      source: "/recover-owner",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    },
    {
      source: "/scan/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    },
  ],
};

export default nextConfig;
