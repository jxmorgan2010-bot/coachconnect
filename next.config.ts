import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Coach profile photos live in the public Vercel Blob store (src/lib/storage.ts). The store id
    // is the first subdomain label, so this covers both the production and dev stores. School IDs
    // are in the private store and never go through the image optimizer.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/coach-photos/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
