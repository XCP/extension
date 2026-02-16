/**
 * Password Memory Security Test
 *
 * Verifies that the plaintext encryption password is scrubbed from V8 heap
 * memory after the wallet is locked. Uses Chrome DevTools Protocol (CDP)
 * HeapProfiler to take a heap snapshot and assert the password string
 * is not retained.
 */

import { test, expect, createWallet, lockWallet, TEST_PASSWORD } from '../fixtures';

test.describe('Password Memory Security', () => {
  test('password is scrubbed from heap after wallet lock', async ({
    extensionPage,
    extensionContext,
  }) => {
    // Create wallet with known password
    await createWallet(extensionPage, TEST_PASSWORD);

    // Lock the wallet — navigates to unlock page, unmounts old components
    await lockWallet(extensionPage);

    // Connect CDP and force garbage collection to free unreferenced strings
    const cdp = await extensionContext.newCDPSession(extensionPage);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');

    // Take heap snapshot — chunks arrive via events before command resolves
    const chunks: string[] = [];
    cdp.on('HeapProfiler.addHeapSnapshotChunk', (params: { chunk: string }) => {
      chunks.push(params.chunk);
    });
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });

    const snapshot = chunks.join('');

    // The plaintext password must NOT be retained in the V8 heap after locking
    expect(snapshot).not.toContain(TEST_PASSWORD);

    await cdp.send('HeapProfiler.disable');
    await cdp.detach();
  });
});
