import { normalizeAddressForComparison } from '@/core/bitcoin/address';

export const BITCOIN_PAYMENT_INTENT_STANDARD = 'xcp-wallet/bitcoin-payment' as const;
export const BITCOIN_PAYMENT_INTENT_VERSION = 1 as const;

export interface BitcoinPaymentIntentV1 {
  standard: typeof BITCOIN_PAYMENT_INTENT_STANDARD;
  version: typeof BITCOIN_PAYMENT_INTENT_VERSION;
  action: 'pay';
  outputs: Array<{ address: string; amountSats: number }>;
  /** Site-supplied context. Displayed as a claim, never used as proof. */
  description?: string;
  /** Optional site reference such as an Emblem vault id. */
  reference?: string;
}

export interface BitcoinPaymentOutput {
  index: number;
  value: number;
  type: string;
  address?: string;
}

export interface BitcoinPaymentProof {
  proved: boolean;
  errors: string[];
  outputs: Array<{ index: number; address: string; amountSats: number }>;
  totalSats: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validate the provider wire shape before persisting it. The result is still an
 * untrusted claim; proveBitcoinPaymentIntent binds it to the decoded PSBT.
 */
export function parseBitcoinPaymentIntent(value: unknown): BitcoinPaymentIntentV1 {
  if (!isRecord(value)) throw new Error('intent must be an object');
  if (value.standard !== BITCOIN_PAYMENT_INTENT_STANDARD || value.version !== 1) {
    throw new Error(`intent must use ${BITCOIN_PAYMENT_INTENT_STANDARD} version 1`);
  }
  if (value.action !== 'pay') throw new Error('intent action must be pay');
  if (!Array.isArray(value.outputs) || value.outputs.length < 1 || value.outputs.length > 20) {
    throw new Error('intent outputs must contain 1 to 20 payments');
  }

  const outputs = value.outputs.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`intent output ${index} must be an object`);
    if (typeof candidate.address !== 'string' || candidate.address.length < 8 || candidate.address.length > 128) {
      throw new Error(`intent output ${index} has an invalid address`);
    }
    if (
      typeof candidate.amountSats !== 'number'
      || !Number.isSafeInteger(candidate.amountSats)
      || candidate.amountSats <= 0
    ) {
      throw new Error(`intent output ${index} amountSats must be a positive safe integer`);
    }
    return { address: candidate.address, amountSats: candidate.amountSats };
  });

  const optionalText = (field: 'description' | 'reference', max: number): string | undefined => {
    const candidate = value[field];
    if (candidate === undefined) return undefined;
    if (typeof candidate !== 'string' || candidate.length < 1 || candidate.length > max) {
      throw new Error(`intent ${field} must be a non-empty string of at most ${max} characters`);
    }
    return candidate;
  };

  return {
    standard: BITCOIN_PAYMENT_INTENT_STANDARD,
    version: BITCOIN_PAYMENT_INTENT_VERSION,
    action: 'pay',
    outputs,
    ...(value.description === undefined ? {} : { description: optionalText('description', 120) }),
    ...(value.reference === undefined ? {} : { reference: optionalText('reference', 160) }),
  };
}

const paymentKey = (address: string, amountSats: number): string =>
  `${normalizeAddressForComparison(address)}\u0000${amountSats}`;

/**
 * Prove the exact external-output set. Wallet-owned outputs are change; every
 * other output must be addressable and appear exactly once in the claim.
 */
export function proveBitcoinPaymentIntent(
  intent: BitcoinPaymentIntentV1,
  outputs: BitcoinPaymentOutput[],
  signerAddresses: string[],
): BitcoinPaymentProof {
  const errors: string[] = [];
  const own = new Set(signerAddresses.map(normalizeAddressForComparison));
  const external: BitcoinPaymentProof['outputs'] = [];

  for (const output of outputs) {
    if (output.type === 'op_return') {
      errors.push(`output ${output.index} carries data; plain Bitcoin payments may not`);
      continue;
    }
    if (!output.address) {
      errors.push(`output ${output.index} has no reviewable Bitcoin address`);
      continue;
    }
    if (!own.has(normalizeAddressForComparison(output.address))) {
      external.push({ index: output.index, address: output.address, amountSats: output.value });
    }
  }

  if (external.length === 0) errors.push('the PSBT has no external payment output');

  const claimedCounts = new Map<string, number>();
  for (const output of intent.outputs) {
    const key = paymentKey(output.address, output.amountSats);
    claimedCounts.set(key, (claimedCounts.get(key) ?? 0) + 1);
  }
  const actualCounts = new Map<string, number>();
  for (const output of external) {
    const key = paymentKey(output.address, output.amountSats);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }

  const keys = new Set([...claimedCounts.keys(), ...actualCounts.keys()]);
  for (const key of keys) {
    if ((claimedCounts.get(key) ?? 0) !== (actualCounts.get(key) ?? 0)) {
      errors.push('the external payment outputs do not exactly match the site intent');
      break;
    }
  }

  return {
    proved: errors.length === 0,
    errors,
    outputs: external,
    totalSats: external.reduce((sum, output) => sum + output.amountSats, 0),
  };
}
