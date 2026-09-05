import { getPublicKey } from '@noble/secp256k1';
import { p2tr, p2wpkh, Transaction } from '@scure/btc-signer';
import { beforeEach, expect, it, vi } from 'vitest';
import { buildDieselMintScript } from '@/core/alkanes/diesel';
import { isDieselMintHeightAllowed } from '@/core/alkanes/dieselMintPolicy';
import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { arc4, bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';
import { type CounterpartyComposer, composeCounterpartyWithDieselMint } from '../dieselCompose';
import { createMockComposeResult } from './helpers/composeTestHelpers';

vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn() }));
vi.mock('@/core/counterparty/utxoSelection');
vi.mock('@/core/settings', async (importOriginal) => ({ ...await importOriginal<typeof import('@/core/settings')>(), getActiveSettings: vi.fn() }));

const source = p2wpkh(getPublicKey(hexToBytes('22'.repeat(32)), true));
const recipient = p2wpkh(getPublicKey(hexToBytes('33'.repeat(32)), true));
const taprootRecipient = p2tr(getPublicKey(hexToBytes('33'.repeat(32)), true).slice(1));
const txid = 'aa'.repeat(32);
const excluded = `${'bb'.repeat(32)}:0`;
const inputValue = 100000;
const params = { destination: recipient.address, asset: 'XCP', quantity: '100000000' };

function dataScript(bytes: Uint8Array, inputTxid = txid) {
  const encrypted = arc4(hexToBytes(inputTxid), bytes);
  return Uint8Array.from([0x6a, ...(encrypted.length <= 75 ? [encrypted.length] : [0x4c, encrypted.length]), ...encrypted]);
}

function fixture(request: Record<string, unknown>, options: {
  vsizeDelta?: number; feeDelta?: number; unknownInput?: boolean; dispenser?: boolean; badDispense?: boolean;
} = {}) {
  const tx = new Transaction({ allowUnknownOutputs: true });
  const inputTxid = options.unknownInput ? 'cc'.repeat(32) : txid;
  tx.addInput({ txid: hexToBytes(inputTxid), index: 0 });
  const btcAmount = request.asset === 'BTC' ? Number(request.quantity) : 0;
  if (request.asset === 'BTC') {
    tx.addOutput({ script: recipient.script, amount: BigInt(btcAmount) });
    if (options.dispenser) {
      // Core dispense.py: CNTRPRTY + short type 13 + zero. Independently fixed payload.
      tx.addOutput({ script: dataScript(hexToBytes(options.badDispense
        ? '434e5452505254590d01' : '434e5452505254590d00'), inputTxid), amount: 0n });
    }
  } else {
    tx.addOutput({ script: dataScript(packComposeMessage('send', request)!.bytes, inputTxid), amount: 0n });
  }
  const more = String(request.more_outputs).split(',');
  const carrierValue = Number(more[0]!.split(':')[0]);
  tx.addOutput({ script: source.script, amount: BigInt(carrierValue) });
  tx.addOutput({ script: hexToBytes(more[1]!.slice(2)), amount: 0n });
  const optimized = request.exact_fee !== undefined;
  if (!optimized) tx.addOutput({ script: source.script, amount: 1n });
  const vsize = tx.unsignedTx.length + 28;
  const fee = (optimized ? Number(request.exact_fee) : vsize * 2) + (options.feeDelta ?? 0);
  const change = optimized ? 0 : inputValue - btcAmount - carrierValue - fee;
  if (!optimized) tx.updateOutput(tx.outputsLength - 1, { amount: BigInt(change) });
  return { result: createMockComposeResult({
    rawtransaction: bytesToHex(tx.unsignedTx), btc_fee: fee, btc_change: change,
    signed_tx_estimated_size: { vsize: vsize + (options.vsizeDelta ?? 0), adjusted_vsize: vsize, sigops_count: 1 },
  }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveSettings).mockReturnValue({ ...DEFAULT_SETTINGS, enableDieselMinting: true });
  vi.mocked(getCurrentBlockHeight).mockReset().mockResolvedValue(965600);
  vi.mocked(selectUtxosForTransaction).mockResolvedValue({
    utxos: [{ txid, vout: 0, value: inputValue, status: { confirmed: true, block_height: 1, block_hash: '', block_time: 1 } }],
    inputsSet: `${txid}:0`, totalValue: inputValue, excludedValue: 330, excludedWithAssets: 1,
    excludedUtxos: [excluded], dieselUtxos: [],
  });
});

it('accepts a locally bounded mint and carries excluded inputs through both passes', async () => {
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, request) => fixture(request));
  const result = await composeCounterpartyWithDieselMint(compose, 'send', params, source.address, 2, 1);
  expect(result.result.diesel_mint?.utxo_kind).toBe('change');
  expect(compose).toHaveBeenCalledTimes(2);
  for (const call of compose.mock.calls) expect(call[5]?.excludedUtxos).toEqual([excluded]);
  expect(getCurrentBlockHeight).toHaveBeenCalledWith(true);
});

it('rejects an inflated API size even when every raw value and the reported fee remain unchanged', async () => {
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, request) => fixture(request, { vsizeDelta: 5000 }));
  await expect(composeCounterpartyWithDieselMint(compose, 'send', params, source.address, 2, 1))
    .rejects.toThrow('unverified DIESEL fee or size');
  expect(compose).toHaveBeenCalledTimes(1);
});

it('rejects excessive derived fees independently of API fee and size claims', async () => {
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, request) => fixture(request, { feeDelta: 20000, vsizeDelta: 10000 }));
  await expect(composeCounterpartyWithDieselMint(compose, 'send', params, source.address, 2, 1))
    .rejects.toThrow('independently verified fee limit');
  expect(compose).toHaveBeenCalledTimes(1);
});

it.each([100, '100', -1, 'invalid'])('enforces caller max_fee=%s locally', async (max_fee) => {
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, request) => fixture(request));
  await expect(composeCounterpartyWithDieselMint(compose, 'send', { ...params, max_fee }, source.address, 2, 1))
    .rejects.toThrow('independently verified fee limit');
  expect(compose).toHaveBeenCalledTimes(1);
});

it('rejects an unoffered first-pass input before considering any fallback', async () => {
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, request) => fixture(request, { unknownInput: true }));
  await expect(composeCounterpartyWithDieselMint(compose, 'send', params, source.address, 2, 1))
    .rejects.toThrow('not independently selected');
  expect(compose).toHaveBeenCalledTimes(1);
});

it.each([undefined, 'auto', 'opreturn'])('preserves original encoding %s and parameters for oversized send data', async (encoding) => {
  const request = { ...params, destination: taprootRecipient.address, asset: 'LONGNAMEDABC', quantity: '9223372036854775807', memo: 'm'.repeat(16), memo_is_hex: 'false', no_dispense: 'false' };
  expect(packComposeMessage('send', request)!.bytes.length).toBe(81);
  const ordinary = { result: createMockComposeResult() };
  const compose = vi.fn<CounterpartyComposer>().mockResolvedValue(ordinary);
  expect(await composeCounterpartyWithDieselMint(compose, 'send', request, source.address, 2, 1, undefined, encoding)).toBe(ordinary);
  expect(compose).toHaveBeenCalledExactlyOnceWith('send', request, source.address, 2, encoding);
  expect(selectUtxosForTransaction).not.toHaveBeenCalled();
});

it('permits an exactly 80-byte enhanced send with a Taproot destination', async () => {
  const request = { ...params, destination: taprootRecipient.address, asset: 'LONGNAMEDABC', quantity: '9223372036854775807', memo: 'm'.repeat(15) };
  expect(packComposeMessage('send', request)!.bytes.length).toBe(80);
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, current) => fixture(current));
  const result = await composeCounterpartyWithDieselMint(compose, 'send', request, source.address, 2, 1, undefined, 'auto');
  expect(result.result.diesel_mint?.utxo_kind).toBe('change');
});

it('keeps a hex-memo send ordinary when local packing cannot prove its transport size', async () => {
  const request = { ...params, memo: 'ff'.repeat(34), memo_is_hex: 'true' };
  const compose = vi.fn<CounterpartyComposer>().mockResolvedValue({ result: createMockComposeResult() });
  await composeCounterpartyWithDieselMint(compose, 'send', request, source.address, 2, 1, undefined, 'auto');
  expect(compose).toHaveBeenCalledExactlyOnceWith('send', request, source.address, 2, 'auto');
  expect(selectUtxosForTransaction).not.toHaveBeenCalled();
});

it.each(['0:6a5d00', `0:${buildDieselMintScript(0).toUpperCase()}`, '0:6a5d', '0:0x6a5d0100'])('skips a caller runestone %s without changing it', async (more_outputs) => {
  const request = { ...params, more_outputs };
  const compose = vi.fn<CounterpartyComposer>().mockResolvedValue({ result: createMockComposeResult() });
  await composeCounterpartyWithDieselMint(compose, 'send', request, source.address, 2, 2, more_outputs, 'auto');
  expect(compose).toHaveBeenCalledExactlyOnceWith('send', request, source.address, 2, 'auto');
  expect(selectUtxosForTransaction).not.toHaveBeenCalled();
});

it('preserves a dispenser payment by recomposing the original host without DIESEL controls', async () => {
  const request = { ...params, asset: 'BTC', quantity: '3000', no_dispense: 'false', max_fee: '1000' };
  const ordinary = { result: createMockComposeResult() };
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, current) => current.more_outputs
    ? fixture(current, { dispenser: true }) : ordinary);
  const result = await composeCounterpartyWithDieselMint(compose, 'send', request, source.address, 2, 1, undefined, 'auto');
  expect(result).toBe(ordinary);
  expect(compose).toHaveBeenNthCalledWith(2, 'send', request, source.address, 2, 'auto');
  expect(result.result.diesel_mint).toBeUndefined();
});

it.each([{ badDispense: true }, { feeDelta: 20000 }, { unknownInput: true }])('rejects dishonest dispenser-shaped responses %j instead of falling back', async (attack) => {
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, request) => fixture(request, { dispenser: true, ...attack }));
  await expect(composeCounterpartyWithDieselMint(compose, 'send', { ...params, asset: 'BTC', quantity: '3000' }, source.address, 2, 1))
    .rejects.toThrow();
  expect(compose).toHaveBeenCalledTimes(1);
});

it.each([0, NaN, 965999, 966000, 966200])('keeps the ordinary host at unavailable or unsupported tip %s', async (height) => {
  vi.mocked(getCurrentBlockHeight).mockResolvedValue(height);
  const compose = vi.fn<CounterpartyComposer>().mockResolvedValue({ result: createMockComposeResult() });
  await composeCounterpartyWithDieselMint(compose, 'send', params, source.address, 2, 1, undefined, 'auto');
  expect(compose).toHaveBeenCalledExactlyOnceWith('send', params, source.address, 2, 'auto');
  expect(selectUtxosForTransaction).not.toHaveBeenCalled();
});

it('refreshes the height on each check and refuses an unavailable or stale preview boundary', async () => {
  vi.mocked(getCurrentBlockHeight).mockResolvedValueOnce(965998).mockResolvedValueOnce(965999).mockRejectedValueOnce(new Error('offline'));
  expect(await isDieselMintHeightAllowed()).toBe(true);
  expect(await isDieselMintHeightAllowed()).toBe(false);
  expect(await isDieselMintHeightAllowed()).toBe(false);
  expect(getCurrentBlockHeight).toHaveBeenCalledTimes(3);
  for (const call of vi.mocked(getCurrentBlockHeight).mock.calls) expect(call).toEqual([true]);
});
