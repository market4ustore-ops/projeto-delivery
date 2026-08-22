import path from 'node:path';
import type { NextConfig } from 'next';
type WebpackConfig = { resolve: { extensionAlias?: Record<string, string[]> } };
const config: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  transpilePackages: ['@delivery/domain', '@delivery/schemas'],
  webpack(config: WebpackConfig) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.js'] };
    return config;
  },
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]);
  },
};
export default config;
