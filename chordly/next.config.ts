import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/Chordly',
  assetPrefix: '/Chordly',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true
};

export default nextConfig;
