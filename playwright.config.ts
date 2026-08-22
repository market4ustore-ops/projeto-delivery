import { defineConfig, devices } from '@playwright/test';
const cleanEnvironmentValue = (value?: string) =>
  value?.replace(/^['"]|['"]$/g, '') ?? '';
const apiUrl = cleanEnvironmentValue(process.env.API_URL);
const anonKey = cleanEnvironmentValue(process.env.ANON_KEY);
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
        SUPABASE_URL: apiUrl,
        SUPABASE_ANON_KEY: anonKey,
      },
    },
    {
      command: 'pnpm --filter @delivery/admin dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 120000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      },
    },
  ],
});
