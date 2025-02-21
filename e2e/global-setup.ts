import { FullConfig } from '@playwright/test';
import globalSetupCreated from './global-setup-created';
import globalSetupImported from './global-setup-imported';

async function globalSetup(config: FullConfig) {
  const projects = config.projects.map(p => p.name);

  // Run setup for 'created' if included in the test run
  if (projects.includes('created')) {
    await globalSetupCreated();
  }

  // Run setup for 'imported' if included in the test run
  if (projects.includes('imported')) {
    await globalSetupImported();
  }
}

export default globalSetup;
