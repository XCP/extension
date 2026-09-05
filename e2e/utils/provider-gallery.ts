import type { BrowserContext, Page, Route } from '@playwright/test';
import { decodeProxyResult } from '../../src/platform/proxySerialization';

/** Exercise the same trusted extension-page RPC boundary as the real approval UI. */
export async function callGalleryService<T>(page: Page, methodName: string, args: unknown[] = []): Promise<T> {
  const response = await page.evaluate(({ methodName, args }) => new Promise<{
    success: boolean; result?: unknown; resultEncoding?: string; error?: { message: string };
  }>((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'proxy:WalletService' });
    const timeout = setTimeout(() => {
      port.disconnect();
      reject(new Error(`WalletService.${methodName} timed out`));
    }, 20_000);
    port.onMessage.addListener(message => {
      if (message.id !== 1) return;
      clearTimeout(timeout);
      port.disconnect();
      resolve(message);
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timeout);
      reject(new Error(chrome.runtime.lastError?.message ?? 'Wallet service disconnected'));
    });
    port.postMessage({ id: 1, methodName, args });
  }), { methodName, args });
  if (!response.success) throw new Error(response.error?.message ?? `${methodName} failed`);
  return (response.resultEncoding === 'xcp-json-v1'
    ? decodeProxyResult(response.result) : response.result) as T;
}

export async function authorizeGalleryOrigin(page: Page, origin: string, paired = false) {
  const wallet = await callGalleryService<{ id: string }>(page, 'getActiveWallet');
  const active = await callGalleryService<{ address: string }>(page, 'getActiveAddress');
  if (!wallet?.id || !active?.address) throw new Error('Gallery requires an unlocked active wallet');
  const identity = { walletId: wallet.id, address: active.address };
  await callGalleryService(page, 'addConnectedWebsite', paired ? [origin, identity] : [origin]);
  return identity;
}

/** A selected run retains all assertions and captures both transaction and PSBT variants. */
export function selectGalleryScenarios<T>(scenarios: T[], name: (scenario: T) => string): T[] {
  const selected = process.env.XCP_GALLERY_SCENARIOS?.split(',').map(value => value.trim()).filter(Boolean);
  if (!selected?.length) return scenarios;
  const unknown = selected.filter(value => !scenarios.some(scenario => name(scenario) === value));
  if (unknown.length) throw new Error(`Unknown gallery scenarios: ${unknown.join(', ')}`);
  return scenarios.filter(scenario => selected.includes(name(scenario)));
}

/** Confirm fixture routes actually see service-worker fetches, where review decoding now runs. */
export async function assertGalleryWorkerRouting(context: BrowserContext, extensionId: string): Promise<void> {
  const worker = context.serviceWorkers().find(item => item.url().startsWith(`chrome-extension://${extensionId}/`));
  if (!worker) throw new Error('Extension background worker is missing');
  const probe = 'https://api.counterparty.io/__gallery/routing-probe';
  let backgroundRequestSeen = false;
  const handler = async (route: Route) => {
    backgroundRequestSeen = route.request().serviceWorker() === worker;
    await route.fulfill({ body: 'background-fixture-ok' });
  };
  await context.route(probe, handler);
  try {
    const answer = await worker.evaluate(async url => (await fetch(url)).text(), probe);
    if (answer !== 'background-fixture-ok' || !backgroundRequestSeen) {
      throw new Error('Gallery network fixtures did not intercept the extension worker');
    }
  } finally {
    await context.unroute(probe, handler);
  }
}

/**
 * The background's API cache outlives a popup. Give each scenario a distinct configured base URL
 * so fabricated balances cannot leak between scenarios. Unstubbed requests keep using the real
 * Counterparty API through the final route; no production cache or authorization is bypassed.
 */
export async function createGalleryApi(context: BrowserContext, page: Page, scenarioId: string) {
  const { counterpartyApiBase } = await callGalleryService<{ counterpartyApiBase: string }>(page, 'getSettings');
  const registrations: Array<{ pattern: string | RegExp; handler: (route: Route) => Promise<void> }> = [];
  const route = async (pattern: string | RegExp, handler: (route: Route) => Promise<void>) => {
    await context.route(pattern, handler);
    registrations.push({ pattern, handler });
  };
  const base = counterpartyApiBase.replace(/\/$/, '');
  const scopedBase = `${base}/__gallery/${encodeURIComponent(scenarioId)}`;
  await route(`${scopedBase}/**`, async intercepted => {
    await intercepted.continue({ url: base + intercepted.request().url().slice(scopedBase.length) });
  });
  await callGalleryService(page, 'updateSettings', [{
    counterpartyApiBase: scopedBase,
  }]);
  return {
    route,
    async dispose() {
      await callGalleryService(page, 'updateSettings', [{ counterpartyApiBase }]);
      for (const registration of registrations) {
        await context.unroute(registration.pattern, registration.handler);
      }
    },
  };
}

export type GalleryApi = Awaited<ReturnType<typeof createGalleryApi>>;
