import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, p2sh, p2tr, p2wpkh, p2wsh, Transaction } from '@scure/btc-signer';
import { beforeEach, expect, it, vi } from 'vitest';
import { fetchDieselBalance } from '@/core/alkanes/api';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';
import { type CounterpartyComposer, composeDieselSendTransaction } from '../dieselCompose';
import { createMockComposeResult } from './helpers/composeTestHelpers';

vi.mock('@/core/alkanes/api', async (importOriginal) => ({ ...await importOriginal<typeof import('@/core/alkanes/api')>(), fetchDieselBalance: vi.fn() }));
vi.mock('@/core/counterparty/utxoSelection');
vi.mock('@/core/settings', async (importOriginal) => ({ ...await importOriginal<typeof import('@/core/settings')>(), getActiveSettings: vi.fn() }));

const source = p2wpkh(getPublicKey(hexToBytes('22'.repeat(32)), true));
const recipientKey = getPublicKey(hexToBytes('33'.repeat(32)), true);
const dieselTxid = 'bb'.repeat(32);
const cleanTxid = 'aa'.repeat(32);
const status = { confirmed: true, block_height: 1, block_hash: '', block_time: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveSettings).mockReturnValue(DEFAULT_SETTINGS);
  vi.mocked(fetchDieselBalance).mockResolvedValue({ baseUnits: '200000000', utxos: [{ txid: dieselTxid, vout: 1, value: 50000, balances: [{ id: '2:0', value: '200000000' }] }] });
  vi.mocked(selectUtxosForTransaction).mockResolvedValue({
    utxos: [{ txid: cleanTxid, vout: 0, value: 100000, status }], inputsSet: `${cleanTxid}:0`, totalValue: 100000,
    dieselUtxos: [{ txid: dieselTxid, vout: 1, value: 50000, status }], excludedValue: 0, excludedWithAssets: 0,
  });
});

it.each([
  [p2wpkh(recipientKey), 330], [p2tr(recipientKey.slice(1)), 330],
  [p2sh(p2wpkh(recipientKey)), 540], [p2pkh(recipientKey), 546],
] as const)('sends only the recipient minimum and returns other BTC for $0.address', async (recipient, expectedSats) => {
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, params, _sourceAddress, _rate, _encoding, control) => {
    expect(params.quantity).toBe(String(expectedSats));
    // The existing 50k-sat DIESEL carrier alone covers dust and fees. Do not add the clean coin.
    expect(control).toEqual({ inputsSet: `${dieselTxid}:1`, useAllInputsSet: true });
    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addInput({ txid: hexToBytes(dieselTxid), index: 1 });
    tx.addOutput({ script: recipient.script, amount: BigInt(expectedSats) });
    tx.addOutput({ script: source.script, amount: 330n });
    tx.addOutput({ script: hexToBytes(String(params.more_outputs).split(',')[1]!.slice(2)), amount: 0n });
    tx.addOutput({ script: source.script, amount: BigInt(50000 - expectedSats - 330 - 1000) });
    return { result: createMockComposeResult({ rawtransaction: bytesToHex(tx.unsignedTx), btc_fee: 1000 }) };
  });
  const result = await composeDieselSendTransaction(compose, { sourceAddress: source.address, destination: recipient.address, amountBaseUnits: '100000000', sat_per_vbyte: 2, max_fee: 2000 });
  const parsed = parseRawTransactionLocally(result.result.rawtransaction)!;
  expect(parsed.inputs).toHaveLength(1);
  expect(parsed.outputs[0]!.value).toBe(expectedSats);
  expect(parsed.outputs[3]!.address).toBe(source.address);
  expect(parsed.outputs[3]!.value).toBe(50000 - expectedSats - 330 - 1000);
  expect(result.result.diesel_transfer?.input_utxos).toEqual([`${dieselTxid}:1`]);
});

it('rejects unsupported recipient scripts before selecting or composing', async () => {
  const compose = vi.fn<CounterpartyComposer>();
  await expect(composeDieselSendTransaction(compose, {
    sourceAddress: source.address, destination: p2wsh(p2pkh(recipientKey)).address,
    amountBaseUnits: '100000000', sat_per_vbyte: 2,
  })).rejects.toThrow('supported recipient address');
  expect(fetchDieselBalance).not.toHaveBeenCalled();
  expect(selectUtxosForTransaction).not.toHaveBeenCalled();
  expect(compose).not.toHaveBeenCalled();
});

it('rejects a recipient amount that exceeds the requested minimum even if the fee balances', async () => {
  const compose = vi.fn<CounterpartyComposer>(async (_endpoint, params) => {
    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addInput({ txid: hexToBytes(dieselTxid), index: 1 });
    tx.addOutput({ script: p2wpkh(recipientKey).script, amount: 546n });
    tx.addOutput({ script: source.script, amount: 330n });
    tx.addOutput({ script: hexToBytes(String(params.more_outputs).split(',')[1]!.slice(2)), amount: 0n });
    tx.addOutput({ script: source.script, amount: 48124n });
    return { result: createMockComposeResult({ rawtransaction: bytesToHex(tx.unsignedTx), btc_fee: 1000 }) };
  });
  await expect(composeDieselSendTransaction(compose, {
    sourceAddress: source.address, destination: p2wpkh(recipientKey).address, amountBaseUnits: '100000000', sat_per_vbyte: 2,
  })).rejects.toThrow('required DIESEL transfer layout');
});
