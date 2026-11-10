import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Script, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { assertFundingIsAssetFree } from '../fundingAssetGuard';
import type { AttachmentEvidenceSource } from '../pendingAttachments';
import { arc4 } from '../unpack/binary';

const assertAttachFundingIsAssetFree = (raw: string, source: AttachmentEvidenceSource) =>
  assertFundingIsAssetFree(raw, { composeType: 'attach' }, source);

const script = hexToBytes(`0014${'11'.repeat(20)}`);
const fundingTxid = 'aa'.repeat(32);
const parent = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
parent.addInput({ txid: fundingTxid, index: 0 });
parent.addOutput({ script, amount: 546n });
parent.addOutput({ script: Script.encode(['RETURN', arc4(hexToBytes(fundingTxid),
  hexToBytes('434e54525052545965' + bytesToHex(new TextEncoder().encode('XCP|10000000|'))))]), amount: 0n });
parent.addOutput({ script, amount: 536n });
const parentHex = bytesToHex(parent.toBytes(true, false));

function spend(vouts: number[]): string {
  const tx = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
  for (const index of vouts) tx.addInput({ txid: parent.id, index });
  tx.addOutput({ script, amount: 546n });
  return bytesToHex(tx.toBytes(true, false));
}
function evidence(confirmed = false, indexed = true): AttachmentEvidenceSource {
  return {
    balances: async () => [],
    withBalances: async () => new Set(),
    parent: async txid => txid === parent.id
      ? { rawTxHex: parentHex, confirmed, blockHeight: 100 } : null,
    ledgerHeights: async () => ({ backendHeight: 100, counterpartyHeight: indexed ? 100 : 99 }),
  };
}

describe('internal attach funding guard', () => {
  it('refuses the reproduced 546-sat asset plus 536-sat change inputs despite empty indexed balances', async () => {
    await expect(assertAttachFundingIsAssetFree(spend([0, 2]), evidence())).rejects.toThrow('asset-free');
  });
  it('allows the proven plain-BTC change of the same unconfirmed attach', async () => {
    await expect(assertAttachFundingIsAssetFree(spend([2]), evidence())).resolves.toBeUndefined();
  });
  it('refuses a confirmed attachment that the ledger has not indexed', async () => {
    await expect(assertAttachFundingIsAssetFree(spend([0]), evidence(true, false))).rejects.toThrow('asset-free');
  });
  it('refuses an unknown parent instead of treating the empty ledger as clean', async () => {
    await expect(assertAttachFundingIsAssetFree(spend([0]), { ...evidence(), parent: async () => null })).rejects.toThrow('asset-free');
  });
  it('refuses known attached assets', async () => {
    const source: AttachmentEvidenceSource = { ...evidence(true), withBalances: undefined,
      balances: async () => [{ asset: 'XCP', quantity: '10000000', quantity_normalized: '0.1' }] as never };
    await expect(assertAttachFundingIsAssetFree(spend([0]), source)).rejects.toThrow('asset-free');
  });
  it('refuses malformed transaction bytes', async () => {
    await expect(assertAttachFundingIsAssetFree('00', evidence())).rejects.toThrow('verify');
  });
});

it.each(['send', 'mpma', 'btcpay', 'burn', 'issuance'])('blocks pending asset funding for %s', async composeType => {
  await expect(assertFundingIsAssetFree(spend([0, 2]), { composeType }, evidence())).rejects.toThrow('asset-free');
});
it.each(['move', 'detach'])('allows only the explicitly selected %s source plus verified clean change', async composeType => {
  await expect(assertFundingIsAssetFree(spend([0, 2]), { composeType, sourceUtxo: `${parent.id}:0` }, evidence())).resolves.toBeUndefined();
  await expect(assertFundingIsAssetFree(spend([0, 2]), { composeType, sourceUtxo: `${parent.id}:2` }, evidence())).rejects.toThrow('asset-free');
  await expect(assertFundingIsAssetFree(spend([0]), { composeType, sourceUtxo: `${parent.id}:2` }, evidence())).rejects.toThrow('does not spend');
  await expect(assertFundingIsAssetFree(spend([0]), { composeType }, evidence())).rejects.toThrow('Select');
});