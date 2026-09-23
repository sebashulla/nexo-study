import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 4,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5190', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'small-phone', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { ...devices['Desktop Safari'], viewport: { width: 768, height: 1024 } } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://nexo-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-public-key' },
  },
})
