import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/performance', workers: 1, reporter: 'list', timeout: 120000,
  use: { baseURL: 'http://127.0.0.1:4317', channel: 'chrome', headless: true },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4317 --strictPort',
    url: 'http://127.0.0.1:4317', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://pamda-test.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ui_test_only', VITE_SUPABASE_ANON_KEY: '' },
  },
});
