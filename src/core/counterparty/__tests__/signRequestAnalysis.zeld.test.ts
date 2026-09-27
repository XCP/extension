import { describe, expect, it, vi } from 'vitest';
import type { InputAttachedAssets } from '../inputAssets';
import type { ProtocolContext } from '../protocolContext';
import { type AnalyzedOutput, analyzeSignRequest } from '../signRequestAnalysis';

vi.mock('@/core/counterparty/transaction', () => ({
  decodeCounterpartyMessage: vi.fn(async () => null),
  resolveMpmaRecipients: vi.fn(async () => []),
  describeMpmaSend: vi.fn(() => 'described locally'),
}));
vi.mock('@/core/counterparty/protocolContext', () => ({
  resolveProtocolContext: vi.fn(async () => ({ context: {} as ProtocolContext, warnings: [] })),
}));
const unpack = vi.hoisted(() => ({ localUnpack: undefined as unknown }));
vi.mock('@/core/counterparty/unpack', () => ({
  verifyProviderTransaction: vi.fn(() => ({ localUnpack: unpack.localUnpack })),
}));
const zeld = vi.hoisted(() => ({
  down: false,
  utxos: [] as Array<{ txid: string; vout: number; balance: bigint }>,
}));
vi.mock('@/core/zeld/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/zeld/api')>()),
  fetchZeldUtxos: vi.fn(async () => {
    if (zeld.down) throw new Error('indexer down');
    return zeld.utxos;
  }),
}));
const settings = vi.hoisted(() => ({ zeldHuntSeconds: 0 }));
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: () => ({ ...actual.DEFAULT_SETTINGS, ...settings }) };
});
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/utxo')>()),
  fetchPreviousRawTransaction: vi.fn(async () => null),
}));

/**
 * The mainnet incident: 19QW… earned 4,096 ZELD on output 1 of a hunted transaction; eleven
 * blocks later a site-built attach of 1 RARESHADILAY to the paired SegWit address, with
 * Counterparty's default layout (attach output first), spent it, and the ZELD landed on the
 * attached asset's UTXO.
 */
const LEGACY = '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX';
const SEGWIT = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const STRANGER = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const HUNTED = '0000004cda9f' + 'c'.repeat(52);
const MOVED = 'c2d433dd87a178397903db6d1b89b16fb64bb782f5222b718b291bbf74628e43';
const CLEAN = 'b'.repeat(64);
const ZELD = 409_600_000_000n;
const ATTACH = { success: true, messageType: 'attach', data: { asset: 'RARESHADILAY', quantity: 1n } };
const OP_RETURN: AnalyzedOutput = { index: 1, value: 0, type: 'op_return', script: '6a0474657374' };

const out = (index: number, address: string, value = 330): AnalyzedOutput =>
  ({ index, value, type: address.startsWith('bc1') ? 'witness_v0_keyhash' : 'pubkeyhash', address });

function analyze(
  outputs: AnalyzedOutput[],
  options: {
    inputs?: Array<{ txid: string; vout: number; address?: string }>;
    sighashType?: number;
    attachedAssets?: InputAttachedAssets[];
    knownZeldOutpoints?: (address: string) => Array<{ outpoint: string; balance?: string }>;
  } = {},
) {
  const inputs = options.inputs ?? [{ txid: HUNTED, vout: 1, address: LEGACY }];
  return analyzeSignRequest({
    counterpartyDataHex: undefined,
    inputs,
    outputs,
    signerAddresses: [LEGACY],
    ownedAddresses: [LEGACY, SEGWIT],
    signedInputIndices: inputs.map((_, index) => index),
    signedInputs: inputs.map((_, index) => ({ index, sighashType: options.sighashType ?? 0x01 })),
    transactionId: undefined,
    attachedAssets: Promise.resolve(options.attachedAssets ?? []),
    knownZeldOutpoints: options.knownZeldOutpoints,
  });
}

const zeldWarnings = (warnings: Awaited<ReturnType<typeof analyze>>['safety']['warnings']) =>
  warnings.filter(warning => warning.code === 'zeld_movement');

function scenario(
  setup: { down?: boolean; utxos?: typeof zeld.utxos; localUnpack?: unknown; hunting?: boolean },
  run: () => Promise<void>,
) {
  return async () => {
    settings.zeldHuntSeconds = setup.hunting ? 20 : 0;
    zeld.down = setup.down ?? false;
    zeld.utxos = setup.utxos ?? [];
    unpack.localUnpack = setup.localUnpack;
    try {
      await run();
    } finally {
      settings.zeldHuntSeconds = 0;
      zeld.down = false;
      zeld.utxos = [];
      unpack.localUnpack = undefined;
    }
  };
}

const incidentOutputs = [out(0, SEGWIT), OP_RETURN, out(2, LEGACY, 50_000)];

describe('ZELD on a site\'s transaction', () => {
  it('reproduces the incident: 4,096 ZELD lands on the output holding the attached asset', scenario(
    { utxos: [{ txid: HUNTED, vout: 1, balance: ZELD }], localUnpack: ATTACH },
    async () => {
      const analysis = await analyze(incidentOutputs);
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([expect.objectContaining({
        severity: 'info',
        data: { kind: 'asset_output', asset: 'RARESHADILAY', vout: 0, amount: ZELD.toString() },
      })]);
      // The only block is the unrelated Counterparty-only gate (this fixture carries no payload).
      expect(analysis.safety.warnings.filter(warning => warning.severity === 'block').map(warning => warning.code))
        .toEqual(['counterparty_only_gate']);
    },
  ));

  it('says nothing for the same attach with change first', scenario(
    {
      utxos: [{ txid: HUNTED, vout: 1, balance: ZELD }],
      localUnpack: { ...ATTACH, data: { ...ATTACH.data, destinationVout: 2 } },
    },
    async () => {
      const analysis = await analyze([{ ...OP_RETURN, index: 0 }, out(1, LEGACY, 50_000), out(2, SEGWIT)]);
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([]);
    },
  ));

  it('warns, for the review step, when the ZELD goes to someone else', scenario(
    { utxos: [{ txid: HUNTED, vout: 1, balance: ZELD }] },
    async () => {
      const analysis = await analyze([out(0, STRANGER, 10_000), out(1, LEGACY, 50_000)]);
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([expect.objectContaining({
        severity: 'warning', data: { kind: 'leaves', destination: STRANGER, amount: ZELD.toString() },
      })]);
      // The only block is the unrelated Counterparty-only gate (this fixture carries no payload).
      expect(analysis.safety.warnings.filter(warning => warning.severity === 'block').map(warning => warning.code))
        .toEqual(['counterparty_only_gate']);
    },
  ));

  it('does not call the paired sibling someone else', scenario(
    { utxos: [{ txid: HUNTED, vout: 1, balance: ZELD }] },
    async () => {
      const analysis = await analyze([out(0, SEGWIT, 10_000)]);
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([]);
    },
  ));

  it('still finds a hunted input when the indexer is down', scenario(
    { down: true, localUnpack: ATTACH },
    async () => {
      const analysis = await analyze(incidentOutputs);
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([expect.objectContaining({
        severity: 'info', data: { kind: 'asset_output', asset: 'RARESHADILAY', vout: 0 },
      })]);
    },
  ));

  it('finds moved ZELD in the wallet\'s record when the indexer is down, with its amount', scenario(
    { down: true, localUnpack: ATTACH },
    async () => {
      const analysis = await analyze(incidentOutputs, {
        inputs: [{ txid: MOVED, vout: 0, address: LEGACY }],
        knownZeldOutpoints: () => [{ outpoint: `${MOVED}:0`, balance: ZELD.toString() }],
      });
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([expect.objectContaining({
        data: { kind: 'asset_output', asset: 'RARESHADILAY', vout: 0, amount: ZELD.toString() },
      })]);
    },
  ));

  it('says nothing when the indexer is down and nothing points to ZELD', scenario(
    { down: true, localUnpack: ATTACH },
    async () => {
      const analysis = await analyze(incidentOutputs, { inputs: [{ txid: CLEAN, vout: 0, address: LEGACY }] });
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([]);
    },
  ));

  it('cautions that a known holder\'s input could not be checked', scenario(
    { down: true, localUnpack: ATTACH },
    async () => {
      const analysis = await analyze(incidentOutputs, {
        inputs: [{ txid: CLEAN, vout: 0, address: LEGACY }],
        knownZeldOutpoints: () => [{ outpoint: `${MOVED}:0`, balance: '1' }],
      });
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([expect.objectContaining({
        severity: 'info', data: { kind: 'unchecked' },
      })]);
    },
  ));

  it('cautions that a listed output\'s ZELD goes to the buyer', scenario(
    { utxos: [{ txid: MOVED, vout: 0, balance: ZELD }] },
    async () => {
      const analysis = await analyze([out(0, LEGACY, 60_000)], {
        inputs: [{ txid: MOVED, vout: 0, address: LEGACY }],
        sighashType: 0x83,
        attachedAssets: [{
          inputIndex: 0, utxo: `${MOVED}:0`,
          assets: [{ asset: 'RARESHADILAY', quantity: 1, quantity_normalized: '1' }],
        } as unknown as InputAttachedAssets],
      });
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([expect.objectContaining({
        severity: 'info', data: { kind: 'listed', asset: 'RARESHADILAY', amount: ZELD.toString() },
      })]);
    },
  ));
});

describe("ZELD on a site's transaction while hunting", () => {
  it('refuses a transaction that would hand the ZELD to someone else, with the fix', scenario(
    { hunting: true, utxos: [{ txid: HUNTED, vout: 1, balance: ZELD }] },
    async () => {
      const analysis = await analyze([out(0, STRANGER, 10_000), out(1, LEGACY, 50_000)]);
      const [warning] = zeldWarnings(analysis.safety.warnings);
      expect(warning).toMatchObject({ severity: 'block', title: 'Blocked: ZELD Would Leave' });
      expect(warning!.message).toContain('have the site try again');
      expect(analysis.safety.blocked).toBe(true);
    },
  ));

  it("refuses the incident's attach, which would put the ZELD on the asset's output", scenario(
    { hunting: true, utxos: [{ txid: HUNTED, vout: 1, balance: ZELD }], localUnpack: ATTACH },
    async () => {
      const analysis = await analyze(incidentOutputs);
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([expect.objectContaining({
        severity: 'block', data: { kind: 'asset_output', asset: 'RARESHADILAY', vout: 0, amount: ZELD.toString() },
      })]);
      expect(analysis.safety.blocked).toBe(true);
    },
  ));

  it("still lets ZELD roll onto the wallet's own plain output", scenario(
    { hunting: true, utxos: [{ txid: HUNTED, vout: 1, balance: ZELD }] },
    async () => {
      const analysis = await analyze([out(0, SEGWIT, 10_000), out(1, STRANGER, 5_000)]);
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([]);
    },
  ));

  it('never blocks on an input it could not check', scenario(
    { hunting: true, down: true, localUnpack: ATTACH },
    async () => {
      const analysis = await analyze(incidentOutputs, {
        inputs: [{ txid: CLEAN, vout: 0, address: LEGACY }],
        knownZeldOutpoints: () => [{ outpoint: `${MOVED}:0`, balance: '1' }],
      });
      expect(zeldWarnings(analysis.safety.warnings)).toEqual([expect.objectContaining({ severity: 'info' })]);
    },
  ));
});
