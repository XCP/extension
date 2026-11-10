import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { clearApiCache } from '@/core/counterparty/api';
import { assertFundingIsAssetFree } from '@/core/counterparty/fundingAssetGuard';
import captured from './fixtures/core-missing-confirmations.json';

vi.mock('@/core/api/client', () => ({ apiClient: { get: vi.fn() }, isApiError: () => false }));

// Shape returned by Core's Bitcoin endpoint: decoded transaction bytes, no confirmations.
const parent = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
parent.addInput({ txid: '11'.repeat(32), index: 0 });
parent.addOutput({ script: hexToBytes(`0014${'22'.repeat(20)}`), amount: 54840n });
const spending = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
spending.addInput({ txid: parent.id, index: 0 });
spending.addOutput({ script: hexToBytes(`0014${'22'.repeat(20)}`), amount: 54000n });
const raw = bytesToHex(spending.toBytes(true, false));
let chainStatus: unknown;
let ledgerHeight: number;
let balances: unknown[];

beforeEach(() => {
  clearApiCache();
  vi.clearAllMocks();
  chainStatus = { confirmed: true, block_height: 100 };
  ledgerHeight = 100;
  balances = [];
  vi.mocked(apiClient.get).mockImplementation(async (url) => {
    let data: unknown;
    if (url.endsWith(`/bitcoin/transactions/${parent.id}`)) {
      data = { result: { hex: bytesToHex(parent.toBytes(true, false)) } };
    } else if (url.endsWith('/withbalances')) {
      data = { result: { [`${parent.id}:0`]: balances.length > 0 } };
    } else if (url.endsWith('/balances')) {
      data = { result: balances };
    } else if (url.endsWith(`/tx/${parent.id}/status`)) {
      data = chainStatus;
    } else if (url.endsWith('/v2/')) {
      data = { result: { backend_height: 100, counterparty_height: ledgerHeight } };
    } else {
      throw new Error(`Unexpected request: ${url}`);
    }
    return { data, status: 200 } as never;
  });
});

it('allows confirmed indexed clean funding when Core omits confirmations', async () => {
  await expect(assertFundingIsAssetFree(raw, { composeType: 'destroy' })).resolves.toBeUndefined();
  expect(vi.mocked(apiClient.get).mock.calls.some(([url]) => url.endsWith('/status'))).toBe(true);
});

it('does not treat missing explorer status as clean', async () => {
  chainStatus = null;
  await expect(assertFundingIsAssetFree(raw, { composeType: 'destroy' })).rejects.toThrow('asset-free');
});

it('does not accept a confirmed output ahead of the ledger', async () => {
  ledgerHeight = 99;
  await expect(assertFundingIsAssetFree(raw, { composeType: 'destroy' })).rejects.toThrow('asset-free');
});

it('still rejects actual attached assets', async () => {
  balances = [{ asset: 'XCPETS', quantity_normalized: '1', quantity: '100000000' }];
  await expect(assertFundingIsAssetFree(raw, { composeType: 'destroy' })).rejects.toThrow('asset-free');
});

it('still checks ancestors for an actually unconfirmed output', async () => {
  chainStatus = { confirmed: false };
  await expect(assertFundingIsAssetFree(raw, { composeType: 'destroy' })).rejects.toThrow('asset-free');
});

it('accepts the reported holder’s confirmed clean output using captured public API responses', async () => {
  const tx = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
  tx.addInput({ txid: captured.txid, index: captured.vout });
  tx.addOutput({ script: hexToBytes(`0014${'22'.repeat(20)}`), amount: 54000n });
  vi.mocked(apiClient.get).mockImplementation(async (url) => {
    const data = url.endsWith(`/bitcoin/transactions/${captured.txid}`) ? captured.transaction
      : url.endsWith('/withbalances') ? captured.membership
      : url.endsWith('/balances') ? captured.balances
      : url.endsWith(`/tx/${captured.txid}/status`) ? captured.status
      : url.endsWith('/v2/') ? captured.heights
      : undefined;
    if (!data) throw new Error(`Unexpected request: ${url}`);
    return { data, status: 200 } as never;
  });
  await expect(assertFundingIsAssetFree(bytesToHex(tx.toBytes(true, false)), { composeType: 'destroy' }))
    .resolves.toBeUndefined();
});

it('does not accept a confirmed status without a block height', async () => {
  chainStatus = { confirmed: true };
  await expect(assertFundingIsAssetFree(raw, { composeType: 'destroy' })).rejects.toThrow('asset-free');
});
