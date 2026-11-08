import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The Hub backdrop asks for quality 80; everything else uses the default 75.
    qualities: [75, 80],
  },
};

export default nextConfig;
