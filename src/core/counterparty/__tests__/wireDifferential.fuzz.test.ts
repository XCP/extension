// @vitest-environment node
/**
 * Differential fuzz: this wallet's decoder against counterparty-core's, over the same bytes.
 *
 * Every wire-format defect found in the 2026-08-05 audit — broadcast text taken from the head
 * where core takes the tail, legacy issuance read in a layout core abandoned at block 753500, an
 * MPMA address table decoded with modern rules where core uses legacy-only — was a disagreement
 * about bytes, found by reading. Reading is unreliable at this: it missed these for months and,
 * in the same session, produced two false findings.
 *
 * `/v2/transactions/unpack` IS core's decoder, reachable over HTTP. Running it against the local
 * unpacker on generated payloads turns "did we read every format correctly" into something the
 * machine answers. Running core locally would be better still and is not currently possible: WSL's
 * disk image is missing and Windows Python fails in python-bitcoinlib at `ctypes.LoadLibrary(None)`.
 *
 * The comparison engine is `verifyProviderTransaction`, the same code the approval screen uses, so
 * a run also exercises the comparator rather than a parallel one written for the test.
 *
 * Not part of the default suite: it needs network. Run with
 *   npx vitest run --config vitest.fuzz.config.ts src/core/counterparty/__tests__/wireDifferential.fuzz.test.ts
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { bytesToHex } from '@/core/counterparty/unpack/binary';
import { verifyProviderTransaction } from '@/core/counterparty/unpack/providerVerify';

const API = 'https://api.counterparty.io:4000';
const CASES_PER_TYPE = Number(process.env.FUZZ_CASES ?? 3);
/** Spacing between calls. The endpoint is shared infrastructure and rate-limits; a fuzz run has
 *  no claim on it, and a 429 is indistinguishable from a decode failure to the comparator. */
const REQUEST_SPACING_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic PRNG so a failure can be reproduced from its seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const P2PKH = ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', '1CounterpartyXXXXXXXXXXXXXXXUWLpVr'];
const BECH32 = ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'];
const ADDRESSES = [...P2PKH, ...BECH32];

/**
 * Numeric assets only. Core resolves a named asset through a ledger lookup this test cannot
 * reach, so a named asset would produce a spurious disagreement about the name rather than about
 * the bytes.
 */
function numericAsset(r: () => number): string {
  const base = 95428956661682177n;
  return 'A' + (base + BigInt(Math.floor(r() * 1_000_000_000))).toString();
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const qty = (r: () => number): string => String(Math.floor(r() * 1e12) + 1);

/** Compose params per message type, randomized. Only types the local packer can build. */
const GENERATORS: Record<string, (r: () => number) => Record<string, unknown>> = {
  send: (r) => ({ destination: pick(r, ADDRESSES), asset: numericAsset(r), quantity: qty(r) }),
  order: (r) => ({
    give_asset: numericAsset(r), give_quantity: qty(r),
    get_asset: numericAsset(r), get_quantity: qty(r),
    expiration: String(Math.floor(r() * 60000)), fee_required: '0',
  }),
  cancel: (r) => ({
    offer_hash: Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join(''),
  }),
  destroy: (r) => ({ asset: numericAsset(r), quantity: qty(r), tag: 'tag' }),
  dividend: (r) => ({
    asset: numericAsset(r), dividend_asset: numericAsset(r), quantity_per_unit: qty(r),
  }),
  sweep: (r) => ({ destination: pick(r, ADDRESSES), flags: String(1 + Math.floor(r() * 3)) }),
  broadcast: (r) => ({
    text: 'fuzz ' + Math.floor(r() * 1e6),
    value: '0', fee_fraction: '0', timestamp: String(1767225600 + Math.floor(r() * 1e6)),
  }),
  issuance: (r) => ({
    asset: numericAsset(r), quantity: qty(r), divisible: r() > 0.5, description: 'fuzz',
  }),
  fairmint: (r) => ({ asset: numericAsset(r), quantity: qty(r) }),
  dispense: () => ({}),
  attach: (r) => ({ asset: numericAsset(r), quantity: qty(r), destination_vout: String(Math.floor(r() * 4)) }),
  detach: (r) => ({ destination: pick(r, ADDRESSES) }),
  dispenser: (r) => ({
    asset: numericAsset(r), give_quantity: qty(r), escrow_quantity: qty(r),
    mainchainrate: String(Math.floor(r() * 1e6) + 1), status: '0',
  }),
  pooldeposit: (r) => ({
    asset_a: numericAsset(r), asset_b: numericAsset(r),
    quantity_a: qty(r), quantity_b: qty(r), min_lp_quantity: '0',
  }),
  poolwithdraw: (r) => ({
    asset_a: numericAsset(r), asset_b: numericAsset(r),
    quantity: qty(r), min_quantity_a: '0', min_quantity_b: '0',
  }),
};

/**
 * Known, understood divergences. `/v2/transactions/unpack` returns one entry per ASSET for an
 * mpma_send rather than one per recipient, so a multi-recipient message cannot be compared field
 * by field — the approval screen reads those recipients from the bytes for exactly this reason.
 */
const EXPECTED_DIVERGENCE = new Set<string>(['mpma']);

async function apiUnpack(datahex: string): Promise<{
  message_type: string; message_type_id: number; message_data: Record<string, unknown>;
} | null> {
  await sleep(REQUEST_SPACING_MS);
  const res = await fetch(`${API}/v2/transactions/unpack?datahex=${datahex}&verbose=true`);
  // A 429 is the harness's own fault, not a decode disagreement — surface it rather than
  // silently counting the payload as unbuildable.
  if (res.status === 429) throw new Error('rate limited by the counterparty API — slow the run down');
  if (!res.ok) return null;
  const json = await res.json();
  return json?.result ?? null;
}

let reachable = false;

describe('local decoder vs counterparty-core, same bytes', () => {
  beforeAll(async () => {
    try {
      const res = await fetch(`${API}/v2/blocks/last`);
      reachable = res.ok;
    } catch {
      reachable = false;
    }
  }, 20000);

  it('agrees with core on every generated payload', async () => {
    if (!reachable) {
      console.warn('counterparty API unreachable — differential fuzz skipped');
      return;
    }

    const divergences: string[] = [];
    const compared: string[] = [];
    const unbuildable: string[] = [];

    for (const [composeType, generate] of Object.entries(GENERATORS)) {
      if (EXPECTED_DIVERGENCE.has(composeType)) continue;

      for (let i = 0; i < CASES_PER_TYPE; i += 1) {
        const seed = 0x5eed + i * 7919 + composeType.length * 104729;
        const params = generate(rng(seed));

        const packed = packComposeMessage(composeType, params as never);
        if (!packed) {
          unbuildable.push(`${composeType}[seed ${seed}]`);
          continue;
        }

        const payloadHex = bytesToHex(packed.bytes);
        const api = await apiUnpack(payloadHex);
        if (!api) {
          unbuildable.push(`${composeType}[seed ${seed}] api rejected`);
          continue;
        }

        // The screen's own comparator, so this exercises it too.
        const result = verifyProviderTransaction(payloadHex, {
          messageType: api.message_type,
          messageTypeId: api.message_type_id,
          messageData: api.message_data,
          description: '',
        });

        compared.push(composeType);
        if (!result.passed) {
          divergences.push(
            `${composeType} [seed ${seed}] ${JSON.stringify(params)}\n    ${result.mismatches.join('\n    ')}`
          );
        }
      }
    }

    console.log(
      `compared ${compared.length} payloads across ${new Set(compared).size} message types` +
      (unbuildable.length ? `; ${unbuildable.length} not built: ${unbuildable.slice(0, 5).join(', ')}` : '')
    );

    // A divergence here means the approval screen and the chain would describe the same bytes
    // differently — the defect class this whole harness exists to catch.
    expect(divergences, `\n${divergences.join('\n')}\n`).toEqual([]);

    // Every generator must actually reach the endpoint. Without this a type whose packer starts
    // returning null is silently dropped from the run and the suite still passes — coverage
    // shrinking quietly is the failure mode this harness exists to prevent.
    const expected = Object.keys(GENERATORS).filter((t) => !EXPECTED_DIVERGENCE.has(t)).sort();
    expect([...new Set(compared)].sort(), `not built: ${unbuildable.join(', ')}`).toEqual(expected);
  }, 300000);
});
