/**
 * The warning list both approval screens render before the user signs.
 *
 * These assertions are deliberately about the text and the severity, not just the count: the
 * severity decides whether the row reads as caution or as danger, and the description is the only
 * place the screen says where the assets actually go.
 */

import { describe, expect, it } from 'vitest';
import { buildApprovalWarnings } from '../approval-warnings';
import type { ApprovalWarningInput } from '../approval-warnings';

const EMPTY: ApprovalWarningInput = {
  safetyWarnings: [],
  attachedAssetDestination: null,
  structureFindings: [],
  signedInputsWithAssets: [],
  signedInputsUnknownStatus: [],
};

const destination = (over: Record<string, unknown>) =>
  ({
    detaches: false,
    leavesWallet: false,
    sourceInputs: [0],
    destinationVout: 1,
    destinationAddress: null,
    ...over,
  }) as ApprovalWarningInput['attachedAssetDestination'];

describe('buildApprovalWarnings', () => {
  it('returns nothing when there is nothing to warn about', () => {
    expect(buildApprovalWarnings(EMPTY)).toEqual([]);
  });

  it('maps a blocking safety warning down to danger', () => {
    // WarningStack has no 'block' severity; unmapped, a blocking warning would render as
    // whatever the component does with an unknown severity.
    const [item] = buildApprovalWarnings({
      ...EMPTY,
      safetyWarnings: [{ severity: 'block', title: 'Sweep', message: 'Drains the address.' }],
    });

    expect(item).toMatchObject({ severity: 'danger', title: 'Sweep', description: 'Drains the address.' });
  });

  it.each([
    ['warning', 'info'],
    ['warning', 'warning'],
    ['danger', 'danger'],
  ])('passes severity %s through unchanged', (_out, severity) => {
    const [item] = buildApprovalWarnings({
      ...EMPTY,
      safetyWarnings: [{ severity: severity as 'info', title: 't', message: 'm' }],
    });

    expect(item?.severity).toBe(severity);
  });

  describe('attached asset destination', () => {
    it('is danger when the assets leave the wallet, and names the output', () => {
      const [item] = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({
          leavesWallet: true,
          destinationVout: 2,
          destinationAddress: 'bc1qexample',
        }),
      });

      expect(item?.severity).toBe('danger');
      expect(item?.title).toBe('Attached assets leave your wallet');
      expect(item?.description).toContain('output #2');
      expect(item?.description).toContain('bc1qexample');
      expect(item?.description).toContain('not an address you control');
    });

    it('is a warning when they land on your own output', () => {
      const [item] = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({}),
      });

      expect(item?.severity).toBe('warning');
      expect(item?.title).toBe('Attached assets move to your own output');
      expect(item?.description).not.toContain('not an address you control');
    });

    it('describes a detach without inventing an output', () => {
      const [item] = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({ detaches: true }),
      });

      expect(item?.title).toBe('Attached assets are detached to your address');
      expect(item?.description).toContain('credited back to your address');
      expect(item?.description).not.toContain('output #');
    });

    it('pluralises the source inputs', () => {
      const one = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({ sourceInputs: [3] }),
      })[0];
      const many = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({ sourceInputs: [3, 4] }),
      })[0];

      expect(one?.description).toContain('input #3');
      expect(many?.description).toContain('inputs #3, #4');
    });
  });

  it('lists every structure finding', () => {
    const items = buildApprovalWarnings({
      ...EMPTY,
      structureFindings: [
        { title: 'Bad ref', message: 'Points at a missing input.' },
        { title: 'Bad vout', message: 'Points past the end.' },
      ] as ApprovalWarningInput['structureFindings'],
    });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.key)).toEqual(['structure-0', 'structure-1']);
    expect(items.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('separates inputs carrying assets from inputs whose status is unknown', () => {
    const items = buildApprovalWarnings({
      ...EMPTY,
      signedInputsWithAssets: [
        { inputIndex: 0, utxo: 'a:0', assets: [{ asset: 'XCP', quantity_normalized: '1.5' }] },
      ] as unknown as ApprovalWarningInput['signedInputsWithAssets'],
      signedInputsUnknownStatus: [
        { inputIndex: 1, utxo: 'b:1', assets: [] },
      ] as unknown as ApprovalWarningInput['signedInputsUnknownStatus'],
    });

    // A failed lookup must never be presented as "no assets" — it gets its own row.
    expect(items.map((i) => i.key)).toEqual(['attached-assets', 'unknown-status']);
    expect(items[1]?.title).toBe("Couldn't verify asset status");
  });

  it('orders safety warnings ahead of the structural ones', () => {
    const items = buildApprovalWarnings({
      safetyWarnings: [{ severity: 'danger', title: 'S', message: 'm' }],
      attachedAssetDestination: destination({}),
      structureFindings: [{ title: 'F', message: 'm' }] as ApprovalWarningInput['structureFindings'],
      signedInputsWithAssets: [
        { inputIndex: 0, utxo: 'a:0', assets: [{ asset: 'XCP', quantity_normalized: '1' }] },
      ] as unknown as ApprovalWarningInput['signedInputsWithAssets'],
      signedInputsUnknownStatus: [
        { inputIndex: 1, utxo: 'b:1', assets: [] },
      ] as unknown as ApprovalWarningInput['signedInputsUnknownStatus'],
    });

    expect(items.map((i) => i.key)).toEqual([
      'safety-0',
      'attached-destination',
      'structure-0',
      'attached-assets',
      'unknown-status',
    ]);
  });
});
