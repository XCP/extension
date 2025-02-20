import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'created',
      testDir: 'e2e/created',
      use: {
        userDataDir: 'userData/created',
        ...devices['Desktop Chrome'],
      } as any,
    },
    {
      name: 'imported',
      testDir: 'e2e/imported',
      use: {
        userDataDir: 'userData/imported',
        ...devices['Desktop Chrome'],
      } as any,
    },
    {
      name: 'onboarding',
      testDir: 'e2e/onboarding',
      use: {
        userDataDir: '',
        ...devices['Desktop Chrome'],
      } as any,
    },
  ],
});
