import path from 'node:path';
import type { NextConfig } from 'next';
type WebpackConfig = {
  resolve: { extensionAlias?: Record<string, string[]> };
};
const config: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  transpilePackages: [
    '@delivery/database',
    '@delivery/domain',
    '@delivery/schemas',
  ],
  webpack(config: WebpackConfig) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.js'] };
    return config;
  },
};
export default config;
