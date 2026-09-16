import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { parsePSBT } from '@/core/bitcoin/psbt';
import { fetchUTXOs } from '@/core/bitcoin/utxo';
import { fetchTokenBalances } from '@/core/counterparty/api';
import { checkOutputPolicy, pinnedDestinations, withPinnedDestinations } from '@/core/counterparty/outputPolicy';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { getActiveSettings } from '@/core/settings';
import { fetchZeldBalance } from '@/core/zeld/api';
import { decodeCborUintArray } from '@/core/zeld/cbor';
import { assessZeldHunt } from '@/core/zeld/huntTemplate';
import { composeZeldPark, composeZeldSend, zeldRecipientDustSats } from '@/core/zeld/sendCompose';
import { OTHER_ADDRESS, PREV_TXID, SOURCE_ADDRESS, SOURCE_P2WPKH } from './fixtures';

vi.mock('@/core/zeld/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/zeld/api')>()),
  fetchZeldBalance: vi.fn(),
}));
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/utxo')>()),
  fetchUTXOs: vi.fn(),
}));
vi.mock('@/core/counterparty/api', () => ({ fetchTokenBalances: vi.fn() }));
vi.mock('@/core/counterparty/utxoSelection', () => ({ selectUtxosForTransaction: vi.fn() }));
vi.mock('@/core/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/settings')>()),
  getActiveSettings: vi.fn(),
}));

const zeldBalance = vi.mocked(fetchZeldBalance);
const bitcoinUtxos = vi.mocked(fetchUTXOs);
const attached = vi.mocked(fetchTokenBalances);
const clean = vi.mocked(selectUtxosForTransaction);
const settings = vi.mocked(getActiveSettings);

const ZELD_A = '000000' + 'a'.repeat(58);
const ZELD_B = '000000' + 'b'.repeat(58);
const utxo = (txid: string, vout: number, value: number, confirmed = true) => ({
  txid, vout, value, status: { confirmed, block_height: 1, block_hash: '', block_time: 0 },
});

describe('composeZeldSend', () => {
  beforeEach(() => {
    settings.mockReturnValue({ allowUnconfirmedTxs: false } as never);
    zeldBalance.mockResolvedValue({
      baseUnits: 409_600_000_000n + 25_600_000_000n,
      utxos: [{ txid: ZELD_A, vout: 1, balance: 409_600_000_000n }, { txid: ZELD_B, vout: 1, balance: 25_600_000_000n }],
    });
    bitcoinUtxos.mockResolvedValue([utxo(ZELD_A, 1, 95_000), utxo(ZELD_B, 1, 80_000), utxo(PREV_TXID, 0, 500_000)]);
    attached.mockResolvedValue([]);
    clean.mockResolvedValue({ utxos: [utxo(PREV_TXID, 0, 500_000)], inputsSet: '', totalValue: 500_000, excludedWithAssets: 0, excludedValue: 0 });
  });

  it('puts change first, the recipient second, and an exact distribution last', async () => {
    const response = await composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '100000000000', sat_per_vbyte: 2,
    });
    const parsed = parseRawTransactionLocally(response.result.rawtransaction)!;
    expect(parsed.inputs.map(input => `${input.txid}:${input.vout}`)).toEqual([`${ZELD_A}:1`, `${ZELD_B}:1`]);
    expect(parsed.outputs.map(output => output.address ?? output.type)).toEqual([SOURCE_ADDRESS, OTHER_ADDRESS, 'op_return']);
    expect(parsed.outputs[1]?.value).toBe(zeldRecipientDustSats(OTHER_ADDRESS));

    const script = parsed.outputs[2]!.opReturnData!;
    expect(script.slice(4, 12)).toBe('5a454c44');
    const payload = Uint8Array.from(Buffer.from(script.slice(12), 'hex'));
    expect(decodeCborUintArray(payload)).toEqual([335_200_000_000n, 100_000_000_000n]);

    const { btc_in, btc_out, btc_change, btc_fee } = response.result;
    expect(btc_in).toBe(175_000);
    expect(btc_in - btc_out - btc_change).toBe(btc_fee);
    expect(btc_fee).toBeGreaterThan(0);
    expect(parsed.outputs[0]?.value).toBe(btc_change);
    expect(response.result.lock_scripts).toEqual([SOURCE_P2WPKH.script, SOURCE_P2WPKH.script].map(s => Buffer.from(s).toString('hex')));
    expect(response.result.inputs_values).toEqual([95_000, 80_000]);
    expect(response.result.zeld_send).toEqual({
      amount_base_units: '100000000000',
      remainder_base_units: '335200000000',
      spent_outpoints: [`${ZELD_A}:1`, `${ZELD_B}:1`],
      change_vout: 0,
      recipient_vout: 1,
    });
    expect(response.result.params).toMatchObject({ asset: 'BTC', destination: OTHER_ADDRESS, quantity: 330 });
    expect(clean).not.toHaveBeenCalled();
  });

  it('carries the witness data the hardware path signs from', async () => {
    const response = await composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '1', sat_per_vbyte: 1,
    });
    const psbt = parsePSBT(response.result.psbt);
    expect(psbt.inputsLength).toBe(2);
    expect(psbt.getInput(0).witnessUtxo?.amount).toBe(95_000n);
  });

  it('passes the composer verification a BTC send gets, and is eligible to hunt', async () => {
    const response = await composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '5', sat_per_vbyte: 1,
    });
    const params = { ...response.result.params, sourceAddress: SOURCE_ADDRESS };
    // No Counterparty message is expected from a BTC send, so nothing to compare bytes against.
    expect(packComposeMessage('send', params)).toBeNull();
    const check = checkOutputPolicy({
      rawTransaction: response.result.rawtransaction,
      ownAddresses: [SOURCE_ADDRESS],
      intendedDestinations: withPinnedDestinations(
        [{ address: OTHER_ADDRESS }],
        pinnedDestinations('send', params, [SOURCE_ADDRESS]),
      ),
    });
    expect(check).toMatchObject({ ok: true });
    const hunt = assessZeldHunt({ rawTxHex: response.result.rawtransaction, sourceAddress: SOURCE_ADDRESS, addressFormat: AddressFormat.P2WPKH });
    expect(hunt.eligible).toBe(true);
  });

  it('tops up from clean outputs when ZELD outputs cannot pay the fee', async () => {
    bitcoinUtxos.mockResolvedValue([utxo(ZELD_A, 1, 400), utxo(ZELD_B, 1, 400), utxo(PREV_TXID, 0, 500_000)]);
    const response = await composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '1', sat_per_vbyte: 2,
    });
    const parsed = parseRawTransactionLocally(response.result.rawtransaction)!;
    expect(parsed.inputs).toHaveLength(3);
    expect(parsed.inputs[2]?.txid).toBe(PREV_TXID);
    expect(response.result.btc_in - response.result.btc_out - response.result.btc_change).toBe(response.result.btc_fee);
  });

  it('refuses when even clean outputs cannot pay the fee', async () => {
    bitcoinUtxos.mockResolvedValue([utxo(ZELD_A, 1, 400), utxo(ZELD_B, 1, 400)]);
    clean.mockResolvedValue({ utxos: [], inputsSet: '', totalValue: 0, excludedWithAssets: 0, excludedValue: 0 });
    await expect(composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '1', sat_per_vbyte: 2,
    })).rejects.toThrow('Insufficient BTC');
  });

  it('leaves out ZELD outputs it cannot spend and says so when the amount needs them', async () => {
    attached.mockResolvedValue([{ utxo: `${ZELD_A}:1`, asset: 'PEPECASH', quantity_normalized: '1' } as never]);
    await expect(composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '400000000000', sat_per_vbyte: 1,
    })).rejects.toThrow('cannot spend yet');
    // The other output alone still covers a smaller amount.
    const response = await composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '25600000000', sat_per_vbyte: 1,
    });
    expect(response.result.zeld_send?.spent_outpoints).toEqual([`${ZELD_B}:1`]);
    expect(response.result.zeld_send?.remainder_base_units).toBe('0');
  });

  it('respects the unconfirmed-inputs setting', async () => {
    bitcoinUtxos.mockResolvedValue([utxo(ZELD_A, 1, 95_000, false), utxo(ZELD_B, 1, 80_000)]);
    const response = await composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '1', sat_per_vbyte: 1,
    });
    expect(response.result.zeld_send?.spent_outpoints).toEqual([`${ZELD_B}:1`]);
    settings.mockReturnValue({ allowUnconfirmedTxs: true } as never);
    const both = await composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits: '1', sat_per_vbyte: 1,
    });
    expect(both.result.zeld_send?.spent_outpoints).toHaveLength(2);
  });

  it.each([
    ['0', 'positive'],
    ['abc', 'positive'],
    ['999999999999999', 'Insufficient ZELD'],
  ])('rejects amount %s', async (amountBaseUnits, message) => {
    await expect(composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: OTHER_ADDRESS, amountBaseUnits, sat_per_vbyte: 1,
    })).rejects.toThrow(message);
  });

  it('rejects an undecodable recipient before reading anything', async () => {
    await expect(composeZeldSend({
      sourceAddress: SOURCE_ADDRESS, destination: 'not-an-address', amountBaseUnits: '1', sat_per_vbyte: 1,
    })).rejects.toThrow('recipient');
    expect(zeldBalance).not.toHaveBeenCalled();
  });

  it('uses address-aware dust for the recipient', () => {
    expect(zeldRecipientDustSats('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe(330);
    expect(zeldRecipientDustSats('bc1p' + 'q'.repeat(58))).toBe(330);
    expect(zeldRecipientDustSats('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(540);
    expect(zeldRecipientDustSats('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(546);
  });
});

describe('composeZeldPark', () => {
  beforeEach(() => {
    settings.mockReturnValue({ allowUnconfirmedTxs: false } as never);
    zeldBalance.mockResolvedValue({
      baseUnits: 409_600_000_000n + 25_600_000_000n,
      utxos: [{ txid: ZELD_A, vout: 1, balance: 409_600_000_000n }, { txid: ZELD_B, vout: 1, balance: 25_600_000_000n }],
    });
    bitcoinUtxos.mockResolvedValue([utxo(ZELD_A, 1, 95_000), utxo(ZELD_B, 1, 80_000)]);
    attached.mockResolvedValue([]);
    clean.mockResolvedValue({ utxos: [], inputsSet: '', totalValue: 0, excludedWithAssets: 0, excludedValue: 0 });
  });

  it('puts all ZELD on a small own output first and clean change second', async () => {
    const response = await composeZeldPark({ sourceAddress: SOURCE_ADDRESS, sat_per_vbyte: 2 });
    const parsed = parseRawTransactionLocally(response.result.rawtransaction)!;
    const sourceScript = Buffer.from(SOURCE_P2WPKH.script).toString('hex');
    expect(parsed.outputs.map(o => o.script ?? o.type)).toEqual([sourceScript, sourceScript, 'op_return']);
    expect(parsed.outputs[0]?.value).toBe(330);
    expect(parsed.outputs[1]?.value).toBe(response.result.btc_change);
    const payload = Uint8Array.from(Buffer.from(parsed.outputs[2]!.opReturnData!.slice(12), 'hex'));
    expect(decodeCborUintArray(payload)).toEqual([435_200_000_000n, 0n]);
    expect(response.result.zeld_send).toEqual({
      amount_base_units: '435200000000',
      remainder_base_units: '0',
      spent_outpoints: [`${ZELD_A}:1`, `${ZELD_B}:1`],
      change_vout: 1,
      recipient_vout: 0,
      park: true,
    });
    expect(response.result.btc_in - response.result.btc_out - response.result.btc_change).toBe(response.result.btc_fee);
    // The small output is first, so the park transaction can itself hunt.
    const hunt = assessZeldHunt({ rawTxHex: response.result.rawtransaction, sourceAddress: SOURCE_ADDRESS, addressFormat: AddressFormat.P2WPKH });
    expect(hunt.eligible).toBe(true);
  });

  it('refuses when there is no spendable ZELD', async () => {
    zeldBalance.mockResolvedValue({ baseUnits: 0n, utxos: [] });
    await expect(composeZeldPark({ sourceAddress: SOURCE_ADDRESS, sat_per_vbyte: 2 })).rejects.toThrow('No spendable ZELD');
  });
});
