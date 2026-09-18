import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Internal packages ship raw TypeScript and are compiled by Next rather than
  // pre-built to dist/. This removes stale-build and watch-race failures, which
  // is the main reason npm workspaces is workable here without pnpm.
  transpilePackages: ['@ft/contracts', '@ft/symbology', '@ft/ui'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default config;
