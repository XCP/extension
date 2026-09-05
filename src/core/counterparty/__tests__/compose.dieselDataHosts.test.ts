import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, p2sh, p2tr, p2wpkh, p2wsh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDieselMintScript, decodeDieselMintScript, dieselUtxoMinimumSats } from '@/core/alkanes/diesel';
import { apiClient } from '@/core/api/client';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { requireCounterpartyFeature } from '@/core/counterparty/capabilities';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { arc4, bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';
import { decryptOpReturnData } from '@/core/counterparty/unpack/opReturn';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';
import { composeBroadcast, composeCancel, composeOrder } from '../compose';
import type { BaseComposeOptions } from '../composeTypes';
import { createMockComposeResponse } from './helpers/composeTestHelpers';

vi.mock('@/core/api/client');
vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn(async () => 965600) }));
vi.mock('@/core/counterparty/utxoSelection');
vi.mock('@/core/counterparty/capabilities', () => ({ requireCounterpartyFeature: vi.fn() }));
vi.mock('@/core/settings', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/settings')>(), getActiveSettings: vi.fn(),
}));

const key = getPublicKey(hexToBytes('22'.repeat(32)), true);
const payment = p2wpkh(key);
const inputTxid = 'aa'.repeat(32);
const inputValue = 100_000;
const base: BaseComposeOptions = { sourceAddress: payment.address, sat_per_vbyte: 2, max_fee: 2000 };

// Fixed vectors produced independently with Python struct/cbor2 in Counterparty Core 11.3's
// container. These follow messages/{order,cancel,broadcast}.py; no product packer builds them.
const hosts = [
  {
    name: 'order',
    params: { give_asset: 'XCP', give_quantity: '100000000', get_asset: 'BTC', get_quantity: '10000000', expiration: 100, fee_required: '0' },
    payload: '434e5452505254590a00000000000000010000000005f5e1000000000000000000000000000098968000640000000000000000',
    call: (options: BaseComposeOptions) => composeOrder({ ...options, give_asset: 'XCP', give_quantity: '100000000', get_asset: 'BTC', get_quantity: '10000000', expiration: 100, fee_required: 0 }),
    decoded: { giveAsset: 'XCP', getAsset: 'BTC' },
  },
  {
    name: 'cancel', params: { offer_hash: '12'.repeat(32) },
    payload: '434e545250525459461212121212121212121212121212121212121212121212121212121212121212',
    call: (options: BaseComposeOptions) => composeCancel({ ...options, offer_hash: ` ${'12'.repeat(32)} ` }),
    decoded: { offerHash: '12'.repeat(32) },
  },
  {
    name: 'broadcast', params: { text: 'DIESEL QA', value: '0', fee_fraction: '0', timestamp: '1700000000' },
    payload: '434e5452505254591e851a6553f100fb000000000000000000604944494553454c205141',
    call: (options: BaseComposeOptions) => composeBroadcast({ ...options, text: 'DIESEL QA', value: '0', fee_fraction: '0', timestamp: '1700000000' }),
    decoded: { text: 'DIESEL QA', timestamp: 1700000000 },
  },
] as const;

function fixtureResponse(requestUrl: string, payload: string, options: {
  sourcePayment?: { script: Uint8Array };
  pointer?: number;
  scriptSuffix?: number;
} = {}) {
  const url = new URL(requestUrl);
  const sourcePayment = options.sourcePayment ?? payment;
  const txid = url.searchParams.get('inputs_set')!.split(':')[0]!;
  const encrypted = arc4(hexToBytes(txid), hexToBytes(payload));
  const dataScript = Uint8Array.from([0x6a, ...(encrypted.length <= 75 ? [encrypted.length] : [0x4c, encrypted.length]), ...encrypted, ...(options.scriptSuffix === undefined ? [] : [options.scriptSuffix])]);
  const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  tx.addInput({ txid: hexToBytes(txid), index: 0, witnessUtxo: { script: sourcePayment.script, amount: BigInt(inputValue) } });
  tx.addOutput({ script: dataScript, amount: 0n });
  const more = url.searchParams.get('more_outputs');
  const dieselSats = more ? Number(more.split(':')[0]) : 0;
  if (more) {
    tx.addOutput({ script: sourcePayment.script, amount: BigInt(dieselSats) });
    tx.addOutput({ script: hexToBytes(options.pointer !== undefined ? buildDieselMintScript(options.pointer) : more.split(',')[1]!.slice(2)), amount: 0n });
  }
  const exactFee = url.searchParams.get('exact_fee');
  const hasChange = !exactFee;
  if (hasChange) tx.addOutput({ script: sourcePayment.script, amount: 1n });
  // Conservatively sized witness; changing the amount never changes an output's serialized size.
  const vsize = tx.unsignedTx.length + (sourcePayment.script[0] === 0x51 ? 17 : 28);
  const fee = exactFee ? Number(exactFee) : Math.ceil(vsize * Number(url.searchParams.get('sat_per_vbyte')));
  const change = hasChange ? inputValue - dieselSats - fee : 0;
  if (hasChange) tx.updateOutput(tx.outputsLength - 1, { amount: BigInt(change) });
  return createMockComposeResponse({
    rawtransaction: bytesToHex(tx.unsignedTx), btc_fee: fee, btc_change: change,
    signed_tx_estimated_size: { vsize, adjusted_vsize: vsize, sigops_count: 1 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveSettings).mockReturnValue({ ...DEFAULT_SETTINGS, enableDieselMinting: true, protectAlkanesUtxos: true });
  vi.mocked(selectUtxosForTransaction).mockResolvedValue({
    utxos: [{ txid: inputTxid, vout: 0, value: inputValue, status: { confirmed: true, block_height: 1, block_hash: '', block_time: 1 } }],
    inputsSet: `${inputTxid}:0`, totalValue: inputValue, excludedWithAssets: 0, excludedValue: 0, dieselUtxos: [],
  });
  vi.mocked(apiClient.get).mockImplementation(async (url) => fixtureResponse(String(url), hosts[0].payload));
});

describe.each(hosts)('$name DIESEL transaction bytes', (host) => {
  it('preserves the independently generated host message and proves optimized wallet return', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => fixtureResponse(String(url), host.payload));
    const response = await host.call(base);
    const urls = vi.mocked(apiClient.get).mock.calls.map(([url]) => new URL(String(url)));
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url.pathname).toContain(`/compose/${host.name}`);
      expect(url.searchParams.get('encoding')).toBe('opreturn');
      expect(url.searchParams.get('max_fee')).toBe('2000');
      for (const [field, value] of Object.entries(host.params)) expect(url.searchParams.get(field)).toBe(String(value));
    }
    expect(urls[1]!.searchParams.get('use_all_inputs_set')).toBe('true');
    expect(urls[1]!.searchParams.get('inputs_set')).toBe(`${inputTxid}:0`);
    const parsed = parseRawTransactionLocally(response.result.rawtransaction)!;
    expect(parsed.outputs).toHaveLength(3);
    expect(parsed.outputs[1]!.address).toBe(payment.address);
    expect(decodeDieselMintScript(parsed.outputs[2]!.opReturnData!)).toMatchObject({ pointer: 1, refund: 1 });
    const payload = decryptOpReturnData(parsed.outputs[0]!.opReturnData!, inputTxid)!;
    expect(payload).toBe(host.payload);
    expect(unpackCounterpartyMessage(payload)).toMatchObject({ success: true, messageType: host.name, data: host.decoded });
    expect(inputValue - parsed.outputs[1]!.value).toBe(response.result.btc_fee);
    expect(response.result.diesel_mint).toMatchObject({ utxo_vout: 1, runestone_vout: 2, marginal_vbytes: 26, estimated_marginal_fee_sats: 52, utxo_kind: 'change' });
  });

  it('rejects a substituted host message even when both compose responses agree', async () => {
    // Change one field of the SAME message family: required fee, offer hash, or final text byte.
    const otherPayload = host.payload.slice(0, -2)
      + (Number.parseInt(host.payload.slice(-2), 16) ^ 1).toString(16).padStart(2, '0');
    vi.mocked(apiClient.get).mockImplementation(async (url) => fixtureResponse(String(url), otherPayload));
    await expect(host.call(base)).rejects.toThrow('requested DIESEL host message');
  });

  it('rejects an appended script opcode even if payload extraction would ignore it', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => fixtureResponse(String(url), host.payload, { scriptSuffix: 0x00 }));
    await expect(host.call(base)).rejects.toThrow('requested DIESEL host message');
  });

  it('rejects a runestone that points at host data', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => fixtureResponse(String(url), host.payload, { pointer: 0 }));
    await expect(host.call(base)).rejects.toThrow('required DIESEL UTXO and runestone outputs');
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it.each(['disabled', 'over-cap', 'multisig', 'taproot', 'unsupported-source'] as const)('keeps original compose behavior for %s', async (reason) => {
    if (reason === 'disabled') vi.mocked(getActiveSettings).mockReturnValue(DEFAULT_SETTINGS);
    const options = {
      ...base,
      ...(reason === 'over-cap' ? { sat_per_vbyte: 3 } : {}),
      ...(reason === 'multisig' || reason === 'taproot' ? { encoding: reason } : {}),
      ...(reason === 'unsupported-source' ? { sourceAddress: p2wsh(p2pkh(key)).address } : {}),
    };
    vi.mocked(apiClient.get).mockResolvedValue(createMockComposeResponse());
    const response = await host.call(options);
    const url = new URL(String(vi.mocked(apiClient.get).mock.calls[0]![0]));
    expect(url.searchParams.has('more_outputs')).toBe(false);
    expect(url.searchParams.get('encoding')).toBe(options.encoding ?? null);
    expect(response.result.diesel_mint).toBeUndefined();
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });
});

it.each([p2wpkh(key), p2tr(key.slice(1)), p2pkh(key), p2sh(p2wpkh(key))])('uses the supported source address output size for $address', async (sourcePayment) => {
  vi.mocked(apiClient.get).mockImplementation(async (url) => fixtureResponse(String(url), hosts[0].payload, { sourcePayment }));
  const response = await hosts[0].call({ ...base, sourceAddress: sourcePayment.address });
  const firstUrl = new URL(String(vi.mocked(apiClient.get).mock.calls[0]![0]));
  expect(firstUrl.searchParams.get('more_outputs')).toBe(`${dieselUtxoMinimumSats(sourcePayment.address)}:${sourcePayment.address},0:${buildDieselMintScript(1)}`);
  expect(response.result.diesel_mint?.marginal_vbytes).toBe(26);
});

it('preserves existing order expiration validation and capability requirements', async () => {
  const params = { ...base, give_asset: 'XCP', give_quantity: 1, get_asset: 'BTC', get_quantity: 1 };
  await expect(composeOrder({ ...params, expiration: 65536 })).rejects.toThrow('Order expiration');
  expect(apiClient.get).not.toHaveBeenCalled();
  vi.mocked(requireCounterpartyFeature).mockRejectedValueOnce(new Error('Feature unavailable'));
  await expect(composeOrder({ ...params, expiration: 0 })).rejects.toThrow('Feature unavailable');
  expect(requireCounterpartyFeature).toHaveBeenCalledWith('indefiniteOrders');
  expect(apiClient.get).not.toHaveBeenCalled();
});

it('preserves protected rolling inputs and their pending chain position', async () => {
  const selection = await selectUtxosForTransaction(payment.address);
  vi.mocked(selectUtxosForTransaction).mockResolvedValue({ ...selection, utxos: [], inputsSet: '', dieselUtxos: [{ ...selection.utxos[0]!, pendingChainDepth: 3 }] });
  const response = await hosts[0].call(base);
  expect(response.result.diesel_mint).toMatchObject({ rolled_utxo: `${inputTxid}:0`, pending_chain_position: 4 });
  for (const [url] of vi.mocked(apiClient.get).mock.calls) expect(new URL(String(url)).searchParams.get('use_all_inputs_set')).toBe('true');
});

describe('short broadcast boundary', () => {
  const broadcastParams = { ...base, value: '0', fee_fraction: '0', timestamp: '1700000000' };

  it('mines an exactly 80-byte UTF-8/CBOR payload and preserves auto encoding above the limit', async () => {
    // Derive the boundary from encoded bytes, not character count. The body includes multibyte text.
    let text = 'é';
    while (packComposeMessage('broadcast', { ...broadcastParams, text })!.bytes.length < 80) text += 'a';
    const packed = packComposeMessage('broadcast', { ...broadcastParams, text })!;
    expect(packed.bytes).toHaveLength(80);
    vi.mocked(apiClient.get).mockImplementation(async (url) => fixtureResponse(String(url), bytesToHex(packed.bytes)));
    expect((await composeBroadcast({ ...broadcastParams, text, encoding: 'auto' })).result.diesel_mint).toBeDefined();
    vi.mocked(apiClient.get).mockClear().mockResolvedValue(createMockComposeResponse());
    expect((await composeBroadcast({ ...broadcastParams, text: `${text}é`, encoding: 'auto' })).result.diesel_mint).toBeUndefined();
    const url = new URL(String(vi.mocked(apiClient.get).mock.calls[0]![0]));
    expect(url.searchParams.get('encoding')).toBe('auto');
    expect(url.searchParams.has('more_outputs')).toBe(false);
  });

  it.each([{ inscription: 'deadbeef' }, { mime_type: 'image/png' }, { timestamp: '0' }])('preserves unsupported broadcast options: %j', async (extra) => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockComposeResponse());
    const response = await composeBroadcast({ ...broadcastParams, text: 'DIESEL QA', ...extra });
    expect(response.result.diesel_mint).toBeUndefined();
    expect(new URL(String(vi.mocked(apiClient.get).mock.calls[0]![0])).searchParams.has('more_outputs')).toBe(false);
  });

  it('takes the default timestamp once for both requests', async () => {
    const requests: URL[] = [];
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    vi.mocked(apiClient.get).mockImplementation(async (url) => {
      const request = new URL(String(url));
      requests.push(request);
      vi.mocked(Date.now).mockReturnValue(1700000001000);
      return fixtureResponse(String(url), hosts[2].payload);
    });
    try {
      await composeBroadcast({ ...base, text: 'DIESEL QA' });
      expect(requests.map(url => url.searchParams.get('timestamp'))).toEqual(['1700000000', '1700000000']);
    } finally { vi.mocked(Date.now).mockRestore(); }
  });
});
