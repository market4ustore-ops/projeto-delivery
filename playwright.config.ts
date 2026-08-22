import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'pnpm --filter @delivery/storefront dev',
      url: 'http://127.0.0.1:3001',
      reuseExistingServer: true,
      timeout: 120000,
      env: {
        ...process.env,
        SUPABASE_URL: process.env.API_URL ?? '',
        SUPABASE_ANON_KEY: process.env.ANON_KEY ?? '',
      },
    },
    {
      command: 'pnpm --filter @delivery/admin dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 120000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: process.env.API_URL ?? '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.ANON_KEY ?? '',
      },
    },
  ],
});
