import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { decodeAddressFromScript } from '@/core/bitcoin/address';
import {
  clearRecentBroadcasts,
  getTrustedBroadcastPrevout,
  rememberSuccessfulBroadcast,
} from '@/platform/provider/recentBroadcasts';

const OWN_SCRIPT = `0014${'11'.repeat(20)}`;
const OWN_ADDRESS = decodeAddressFromScript(OWN_SCRIPT)!;

function buildTransaction(outputScript: string, value = 5000n): string {
  const tx = new Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true });
  tx.addInput({ txid: new Uint8Array(32).fill(1), index: 0 });
  tx.addOutput({ script: hexToBytes(outputScript), amount: value });
  return bytesToHex(tx.unsignedTx);
}

describe('recent broadcast prevouts', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    (global as any).browser = fakeBrowser;
    (global as any).chrome = fakeBrowser;
    await clearRecentBroadcasts();
  });

  it('persists a safe wallet-owned output across extension contexts', async () => {
    const rawTxHex = buildTransaction(OWN_SCRIPT);

    await rememberSuccessfulBroadcast(rawTxHex, [OWN_ADDRESS.toUpperCase()]);

    const stored = await fakeBrowser.storage.session.get('recent_safe_broadcast_prevouts');
    const records = stored.recent_safe_broadcast_prevouts as Array<{ txid: string }>;
    expect(records).toHaveLength(1);
    const prevout = await getTrustedBroadcastPrevout(records[0]!.txid, 0, OWN_ADDRESS.toUpperCase());
    expect(prevout).toMatchObject({
      vout: 0,
      address: OWN_ADDRESS,
      value: 5000,
      scriptPubKey: OWN_SCRIPT,
      rawTxHex,
    });
  });

  it('does not persist an output that is not owned by the broadcasting wallet', async () => {
    await rememberSuccessfulBroadcast(buildTransaction(OWN_SCRIPT), ['bc1qnotours']);

    expect(await fakeBrowser.storage.session.get('recent_safe_broadcast_prevouts')).toEqual({});
  });
});
