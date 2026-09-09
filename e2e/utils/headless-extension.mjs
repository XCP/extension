// Optional Node preload for the existing walletTest fixture. Full headless Chromium supports
// extensions; the headless-shell executable does not. No fixture or product settings are changed.
import { chromium } from 'playwright-core';

const launchPersistentContext = chromium.launchPersistentContext.bind(chromium);
chromium.launchPersistentContext = (directory, options) => launchPersistentContext(directory, {
  ...options,
  headless: true,
  channel: 'chromium',
});
