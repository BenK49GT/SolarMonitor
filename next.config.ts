import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is bound on every interface. Allow this machine's own
  // addresses so the browser can load the page from localhost or a LAN IP.
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.8", "192.168.1.100"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
