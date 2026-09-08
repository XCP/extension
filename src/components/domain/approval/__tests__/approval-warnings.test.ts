/**
 * The warning list both approval screens render before the user signs.
 *
 * These assertions are deliberately about the text and the severity, not just the count: the
 * severity decides whether the row reads as caution or as danger, and the description is the only
 * place the screen says where the assets actually go.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { checkMessageStructure } from '@/core/counterparty/messageStructure';
import { analyzeTransactionSafety, type SecurityWarning } from '@/core/counterparty/transactionSafety';
import { configureLocale, t } from '@/i18n';
import type { ApprovalWarningInput } from '../approval-warnings';
import { buildApprovalWarnings } from '../approval-warnings';

const EMPTY: ApprovalWarningInput = {
  safetyWarnings: [],
  attachedAssetDestination: null,
  structureFindings: [],
  signedInputsWithAssets: [],
  signedInputsUnknownStatus: [],
};

afterEach(() => configureLocale({ language: 'en' }));

const structureFindings = [
  ...checkMessageStructure('utxo', { source: `${'AB'.repeat(32)}:1234` }, { inputs: [], outputs: [] }),
  ...checkMessageStructure('attach', { destinationVout: 1234 }, { inputs: [], outputs: [{ index: 0 }] }),
];

const destination = (over: Record<string, unknown>) =>
  ({
    detaches: false,
    leavesWallet: false,
    sourceInputs: [0],
    destinationVout: 1,
    destinationAddress: undefined,
    destinationCommitted: true,
    mode: 'implicit-output',
    ...over,
  }) as ApprovalWarningInput['attachedAssetDestination'];

describe('buildApprovalWarnings', () => {
  it('returns nothing when there is nothing to warn about', () => {
    expect(buildApprovalWarnings(EMPTY)).toEqual([]);
  });

  it('warns when rendered transaction text contains deceptive characters', () => {
    const items = buildApprovalWarnings({
      ...EMPTY,
      displayedText: ['Send 1 XCP', 'memo: pay \u202Eresu\u202C'],
    });

    expect(items).toContainEqual(expect.objectContaining({
      key: 'display-deceptive-characters',
      severity: 'warning',
      title: 'Transaction details contain hidden characters',
    }));
  });

  it('scans asset labels rendered by the approval summary', () => {
    const items = buildApprovalWarnings({
      ...EMPTY,
      displayedText: ['TRUSTED\u200bASSET'],
    });

    expect(items.map((item) => item.key)).toContain('display-deceptive-characters');
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

  it.each(['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const)(
    'translates serialized English safety findings in the %s foreground without changing their decisions',
    (language) => {
      const signer = '1MySignerAddressXXXXXXXXXXXXXXabc123';
      const destination = 'bc1qExactAddressCaseIsPreserved';
      const dataScript = `51${`21${'ab'.repeat(33)}`.repeat(3)}53ae`;
      const analyze = () => [
        ...['sweep', 'destroy', 'detach', 'future_PROTOCOL'].flatMap(type =>
          analyzeTransactionSafety(type, [], signer).warnings),
        ...analyzeTransactionSafety(undefined, [{ value: 0, type: 'op_return' }], signer).warnings,
        ...analyzeTransactionSafety('enhanced_send', [{ value: 12345678, type: 'address', address: destination }], signer).warnings,
        ...analyzeTransactionSafety('enhanced_send', [
          { value: 12345678, type: 'address', address: destination },
          { value: 87654322, type: 'address', address: '1OtherExactAddress' },
        ], signer).warnings,
        ...analyzeTransactionSafety('btcpay', [{ value: 12345678, type: 'address', address: destination }], signer).warnings,
        ...analyzeTransactionSafety(undefined, [{ value: 12345678, type: 'address', address: destination }], signer, { plainBitcoinPayment: true }).warnings,
        ...analyzeTransactionSafety('enhanced_send', [], signer, { verifiedCommit: { address: destination, value: 12345678 } }).warnings,
        ...[1, 2].flatMap(count => analyzeTransactionSafety('fairminter',
          Array.from({ length: count }, () => ({ value: 1234, type: 'unknown', script: dataScript })), signer).warnings),
        ...[1, 2].flatMap(count => analyzeTransactionSafety('enhanced_send',
          Array.from({ length: count }, () => ({ value: 12345678, type: 'unknown' })), signer).warnings),
      ];
      configureLocale({ language: 'en', numberLocale: 'en-US' });
      const serialized: SecurityWarning[] = JSON.parse(JSON.stringify(analyze()));
      const snapshot = JSON.stringify(serialized);
      expect(serialized.find(w => w.code === 'destroy')?.title).toBe('Danger: Supply Destruction');
      expect(serialized.find(w => w.code === 'external_btc_output')?.data).toEqual({
        totalSats: 12345678, addresses: [destination],
      });

      configureLocale({ language, numberLocale: 'de-DE' });
      const items = buildApprovalWarnings({ ...EMPTY, safetyWarnings: serialized });
      const foreground = analyze();
      expect(items).toHaveLength(serialized.length);
      items.forEach((item, index) => {
        const original = serialized[index]!;
        expect(item).toMatchObject({
          key: `safety-${index}`,
          severity: original.severity === 'block' ? 'danger' : original.severity,
          blocking: original.severity === 'block',
          title: foreground[index]!.title,
          description: foreground[index]!.message,
        });
        expect(item.title).not.toBe(original.title);
        expect(item.description).not.toBe(original.message);
      });
      expect(items.find(item => item.title === t('safety_unknown_transaction_type'))?.description).toContain('future_PROTOCOL');
      expect(items.find(item => item.title === t('safety_btc_sent_to_external_address'))?.description).toContain('0.12345678');
      expect(JSON.stringify(serialized)).toBe(snapshot);
    },
  );

  it.each(['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const)('uses recovery-key counts in %s without translating unknown diagnostics', language => {
    configureLocale({ language });
    const safetyWarnings: SecurityWarning[] = [1, 2].map(count => ({
      code: 'misdirected_recovery_key', data: { count }, severity: 'warning', title: 'English title', message: 'English body',
    }));
    safetyWarnings.push({ severity: 'block', title: 'Remote diagnostic', message: 'Original API error: 0123 / exact' });
    const items = buildApprovalWarnings({ ...EMPTY, safetyWarnings });
    expect(items[0]?.description).toBe(t('safety_data_output_embeds_a_recovery_key', '1'));
    expect(items[1]?.description).toBe(t('safety_data_outputs_embed_a_recovery_key', '2'));
    expect(items[2]).toMatchObject({ title: 'Remote diagnostic', description: 'Original API error: 0123 / exact', severity: 'danger', blocking: true });
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

    it('is calm information when they land on your own output', () => {
      const [item] = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({}),
      });

      expect(item?.severity).toBe('info');
      expect(item?.title).toBe('Attached assets move to your own output');
      expect(item?.description).not.toContain('not an address you control');
    });

    it('describes a detach without inventing an output', () => {
      const [item] = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({ detaches: true }),
      });

      expect(item?.title).toBe('Attached assets are detached to your address');
      expect(item?.severity).toBe('info');
      expect(item?.description).toContain('credited back to your address');
      expect(item?.description).not.toContain('output #');
    });

    it('deduplicates the generic detach warning and includes the exact assets in the destination', () => {
      const items = buildApprovalWarnings({
        ...EMPTY,
        safetyWarnings: [{
          code: 'detach_all',
          severity: 'warning',
          title: 'Moves Everything on the UTXO',
          message: 'Every asset moves.',
        }],
        attachedAssetDestination: destination({ detaches: true }),
        signedInputsWithAssets: [{
          inputIndex: 0,
          utxo: 'a:0',
          assets: [{ asset: 'RAREPEPE', quantity_normalized: '1' }],
        }] as unknown as ApprovalWarningInput['signedInputsWithAssets'],
      });

      expect(items).toHaveLength(1);
      expect(items[0]?.key).toBe('attached-destination');
      expect(items[0]?.children).toBeDefined();
    });

    it('does not present a SINGLE|ANYONECANPAY placeholder as guaranteed delivery', () => {
      const [item] = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({
          destinationCommitted: false,
          mode: 'flexible',
          destinationVout: 0,
          destinationAddress: 'bc1qplaceholder',
        }),
      });

      expect(item?.severity).toBe('danger');
      expect(item?.title).toBe('Asset delivery is flexible');
      expect(item?.description).toContain('does not fix the asset destination');
      expect(item?.description).not.toContain('credited to output');
    });

    it('names the destination proved by an explicit detach', () => {
      const [item] = buildApprovalWarnings({
        ...EMPTY,
        attachedAssetDestination: destination({
          detaches: true,
          mode: 'explicit-detach',
          destinationVout: null,
          destinationAddress: 'bc1qbuyer',
          leavesWallet: true,
        }),
      });

      expect(item?.description).toContain('detached to bc1qbuyer');
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
      structureFindings,
    });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.key)).toEqual(['structure-0', 'structure-1']);
    expect(items.every((i) => i.severity === 'warning')).toBe(true);
    expect(items.every((i) => i.blocking)).toBe(true);
  });

  it.each(['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'])('translates local structure findings in %s without changing evidence or the block', language => {
    const before = structuredClone(structureFindings);
    configureLocale({ language, numberLocale: 'de-DE' });
    const [move, attach] = buildApprovalWarnings({ ...EMPTY, structureFindings });
    expect(move).toMatchObject({
      key: 'structure-0', severity: 'warning', blocking: true,
      title: t('approval_structure_utxo_source_not_spent_title'),
      description: t('approval_structure_utxo_source_not_spent_description', [`${'AB'.repeat(32)}:1234`]),
    });
    expect(attach).toMatchObject({
      key: 'structure-1', severity: 'warning', blocking: true,
      title: t('approval_structure_attach_missing_output_title'),
      description: t('approval_structure_attach_missing_output_one', ['1234', '1']),
    });
    expect(move?.description).toContain(`${'AB'.repeat(32)}:1234`);
    expect(attach?.description).toContain('#1234');
    expect(attach?.description).not.toContain('#1.234');
    expect(structureFindings).toEqual(before);
    if (language !== 'en') expect(move?.title).not.toBe(before[0]?.title);
  });

  it('keeps zero and multiple output counts distinct from the singular message', () => {
    for (const outputCount of [0, 2]) {
      const findings = checkMessageStructure('attach', { destinationVout: 7 }, {
        inputs: [], outputs: Array.from({ length: outputCount }, (_, index) => ({ index })),
      });
      const [item] = buildApprovalWarnings({ ...EMPTY, structureFindings: findings });
      expect(item?.description).toContain(`${outputCount} outputs`);
      expect(item?.description).toContain('If signed and confirmed, the Bitcoin fee would still be paid.');
    }
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
      structureFindings: structureFindings.slice(0, 1),
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
      'unknown-status',
    ]);
  });
});
