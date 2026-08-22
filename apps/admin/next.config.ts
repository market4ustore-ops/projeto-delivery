import path from 'node:path';
import type { NextConfig } from 'next';
const config: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  transpilePackages: ['@delivery/database', '@delivery/schemas'],
};
export default config;
