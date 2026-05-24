import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdf-parse", "@prisma/client", "ffmpeg-static", "fluent-ffmpeg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.oaiusercontent.com" },
      { protocol: "https", hostname: "**.meshy.ai" },
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
