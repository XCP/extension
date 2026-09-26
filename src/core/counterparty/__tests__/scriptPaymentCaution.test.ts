/**
 * The script-address caution for transactions the wallet builds itself, flow family by flow
 * family: each builds the outputs that flow composes and checks when the caution applies.
 */

import * as btc from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeAddressFromScript } from '@/core/bitcoin/address';
import {
  assessOwnScriptPayments,
  composedTransactionOutputs,
  plannedPaymentOutputs,
  scriptPaymentRiskText,
} from '@/core/counterparty/scriptPaymentCaution';

const api = vi.hoisted(() => ({
  fetchTokenBalances: vi.fn(),
  fetchOwnedAssets: vi.fn(),
}));
vi.mock('@/core/counterparty/api', () => api);

const PAYER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
const P2WSH = decodeAddressFromScript(`0020${'22'.repeat(32)}`)!;
const P2SH = decodeAddressFromScript(`a914${'33'.repeat(20)}87`)!;
const P2WPKH = decodeAddressFromScript(`0014${'55'.repeat(20)}`)!;
const P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
/** A Taproot address in another of this wallet's wallets. */
const OWN_TAPROOT = decodeAddressFromScript(`5120${'44'.repeat(32)}`)!;

const script = (address: string) => btc.OutScript.encode(btc.Address().decode(address));

/** A composed transaction: `payments` in order, an optional data output, then change to the payer. */
function composed(payments: [string, bigint][], data = false): string {
  const tx = new btc.Transaction({ allowUnknownOutputs: true });
  tx.addInput({ txid: 'ab'.repeat(32), index: 0 });
  for (const [address, amount] of payments) tx.addOutput({ script: script(address), amount });
  if (data) tx.addOutput({ script: btc.Script.encode(['RETURN', new Uint8Array(20)]), amount: 0n });
  tx.addOutput({ script: script(PAYER), amount: 50_000n });
  return tx.hex;
}

function assess(rawTransaction: string, options: { inputsCarryAssets?: boolean; provenAddresses?: string[] } = {}) {
  const ownedAddresses = [PAYER, OWN_TAPROOT];
  return assessOwnScriptPayments({
    outputs: composedTransactionOutputs(rawTransaction, ownedAddresses),
    payerAddress: PAYER,
    ownedAddresses,
    ...options,
  });
}

const holds = () => {
  api.fetchTokenBalances.mockResolvedValue([{ asset: 'XCP' }]);
  api.fetchOwnedAssets.mockResolvedValue([]);
};
const holdsNothing = () => {
  api.fetchTokenBalances.mockResolvedValue([]);
  api.fetchOwnedAssets.mockResolvedValue([]);
};

beforeEach(() => {
  vi.clearAllMocks();
  holds();
});

describe('composedTransactionOutputs', () => {
  it('reads each output with its script, naming owned change by the owned address', () => {
    const outputs = composedTransactionOutputs(composed([[P2TR, 600n]], true), [PAYER]);
    expect(outputs).toHaveLength(3);
    expect(outputs[0]).toMatchObject({ address: P2TR, value: 600 });
    expect(outputs[1]!.address).toBeUndefined();
    expect(outputs[2]).toMatchObject({ address: PAYER, value: 50_000 });
  });
});

describe('BTC send', () => {
  it.each([
    ['P2TR', P2TR],
    ['P2WSH', P2WSH],
    ['P2SH', P2SH],
  ])('cautions a payment to a %s address from an address holding assets', async (_label, address) => {
    const risk = await assess(composed([[address, 10_000n]]));
    expect(risk).toEqual({ totalSats: 10_000, addresses: [address], source: PAYER });
  });

  it.each([
    ['P2WPKH', P2WPKH],
    ['P2PKH', P2PKH],
  ])('never cautions a %s destination, and does not look anything up', async (_label, address) => {
    expect(await assess(composed([[address, 10_000n]]))).toBeNull();
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });

  it('never cautions a script address this wallet owns', async () => {
    expect(await assess(composed([[OWN_TAPROOT, 10_000n]]))).toBeNull();
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });

  it('changes nothing for an address holding no assets', async () => {
    holdsNothing();
    expect(await assess(composed([[P2TR, 10_000n]]))).toBeNull();
    expect(api.fetchTokenBalances).toHaveBeenCalledWith(PAYER, { limit: 1, verbose: false });
  });

  it('cautions when the holdings cannot be looked up', async () => {
    api.fetchTokenBalances.mockRejectedValue(new Error('offline'));
    expect(await assess(composed([[P2TR, 10_000n]]))).not.toBeNull();
  });

  it('counts an owned asset as holding', async () => {
    api.fetchTokenBalances.mockResolvedValue([]);
    api.fetchOwnedAssets.mockResolvedValue([{ asset: 'PEPECASH' }]);
    expect(await assess(composed([[P2TR, 10_000n]]))).not.toBeNull();
  });
});

describe('Counterparty send and MPMA with BTC outputs', () => {
  it('names every script address paid, and only those', async () => {
    const risk = await assess(composed([[P2TR, 1_000n], [P2WPKH, 2_000n], [P2WSH, 3_000n]], true));
    expect(risk).toEqual({ totalSats: 4_000, addresses: [P2TR, P2WSH], source: PAYER });
    expect(scriptPaymentRiskText(risk!).description).toBe(
      `0.00004000 BTC goes to script addresses: ${P2TR}, ${P2WSH}. Paying a script address can let its owner move your Counterparty assets from ${PAYER}. Only continue if you trust the recipients.`,
    );
  });
});

describe('dispense', () => {
  it('cautions paying a dispenser at a script address', async () => {
    const risk = await assess(composed([[P2SH, 5_788n]], true));
    expect(risk?.addresses).toEqual([P2SH]);
    expect(scriptPaymentRiskText(risk!)).toEqual({
      title: 'Payment to a Script Address',
      description: `0.00005788 BTC goes to ${P2SH}, a script address. Paying a script address can let its owner move your Counterparty assets from ${PAYER}. Only continue if you trust the recipient.`,
    });
  });

  it('does not caution a dispenser at a key-hash address', async () => {
    expect(await assess(composed([[P2PKH, 5_788n]], true))).toBeNull();
  });
});

describe('BTCPay', () => {
  it('cautions settling an order match whose BTC side is a script address', async () => {
    expect((await assess(composed([[P2WSH, 25_000n]], true)))?.addresses).toEqual([P2WSH]);
  });
});

describe('UTXO attach, move and detach', () => {
  it('does not caution an attach, whose new UTXO is the payer\'s own', async () => {
    expect(await assess(composed([[PAYER, 546n]], true))).toBeNull();
  });

  it('cautions moving attached assets to a script address even when the address holds nothing else', async () => {
    holdsNothing();
    const risk = await assess(composed([[P2TR, 546n]]), { inputsCarryAssets: true });
    expect(risk?.addresses).toEqual([P2TR]);
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });

  it('does not caution a move to the wallet\'s own address', async () => {
    expect(await assess(composed([[OWN_TAPROOT, 546n]]), { inputsCarryAssets: true })).toBeNull();
  });
});

describe('inscription commit', () => {
  it('does not caution a commit output proved against the request\'s envelope', async () => {
    expect(await assess(composed([[P2TR, 10_000n]]), { provenAddresses: [P2TR] })).toBeNull();
  });
});

describe('consolidation (payments planned before the transaction is built)', () => {
  it('cautions a script-address destination and service fee', async () => {
    const risk = await assessOwnScriptPayments({
      outputs: plannedPaymentOutputs([{ address: P2WSH, value: 90_000 }, { address: P2TR, value: 1_000 }]),
      payerAddress: PAYER,
      ownedAddresses: [],
    });
    expect(risk).toEqual({ totalSats: 91_000, addresses: [P2WSH, P2TR], source: PAYER });
  });

  it('does not caution consolidating to the payer with a key-hash fee address', async () => {
    const risk = await assessOwnScriptPayments({
      outputs: plannedPaymentOutputs([{ address: PAYER, value: 90_000 }, { address: P2WPKH, value: 1_000 }]),
      payerAddress: PAYER,
      ownedAddresses: [],
    });
    expect(risk).toBeNull();
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });
});
