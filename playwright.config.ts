import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'html',
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
      timeout: 60000,
    },
  },
  projects: [
    {
      name: 'onboarding',
      testMatch: 'onboarding/*.spec.ts',
      use: { userDataDir: 'userData/onboarding' } as any,
    },
    {
      name: 'created',
      testMatch: 'created/*.spec.ts',
      use: {
        userDataDir: 'userData/created',
        storageState: 'userData/created/state.json',
      } as any,
    },
    {
      name: 'imported',
      testMatch: 'imported/*.spec.ts',
      use: {
        userDataDir: 'userData/imported',
        storageState: 'userData/imported/state.json',
      } as any,
    },
  ],
  globalSetup: './e2e/global-setup.ts',
});
