import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import {
  knownZeldOutpoints,
  MAX_ZELD_OUTPOINTS_PER_ADDRESS,
  parseZeldOutpointUpdate,
  sanitizeZeldOutpointEntries,
  withZeldOutpoints,
} from '@/core/zeld/knownOutpoints';
import { zeldRecordAfterBroadcast, zeldRecordFromIndexer } from '@/core/zeld/recordReads';
import { opReturnScript, PREV_TXID, SOURCE_ADDRESS, SOURCE_P2WPKH, unsignedRawTx } from './fixtures';

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const OTHER = '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX';
const A = `${'a'.repeat(64)}:0`;
const B = `${'b'.repeat(64)}:1`;

describe('the wallet\'s record of its ZELD outputs', () => {
  it('replaces an address\'s entries with the indexer\'s answer and leaves other addresses alone', () => {
    const first = withZeldOutpoints([], OTHER, { replace: [{ outpoint: B, balance: '5' }] })!;
    const next = withZeldOutpoints(first, ADDRESS.toUpperCase(), zeldRecordFromIndexer([
      { txid: 'a'.repeat(64), vout: 0, balance: 409_600_000_000n },
    ]))!;
    expect(knownZeldOutpoints(next, ADDRESS)).toEqual([{ outpoint: A, balance: '409600000000' }]);
    expect(knownZeldOutpoints(next, OTHER)).toEqual([{ outpoint: B, balance: '5' }]);
    const emptied = withZeldOutpoints(next, ADDRESS, { replace: [] })!;
    expect(knownZeldOutpoints(emptied, ADDRESS)).toEqual([]);
  });

  it('writes nothing when the answer is unchanged', () => {
    const entries = withZeldOutpoints([], ADDRESS, { replace: [{ outpoint: A, balance: '1' }] })!;
    expect(withZeldOutpoints(entries, ADDRESS, { replace: [{ outpoint: A, balance: '1' }] })).toBeNull();
    expect(withZeldOutpoints(entries, ADDRESS, { add: [{ outpoint: A, balance: '1' }] })).toBeNull();
  });

  it('adds and removes what the wallet\'s own transactions left and spent, keeping an unknown amount unknown', () => {
    const entries = withZeldOutpoints([], ADDRESS, { replace: [{ outpoint: A, balance: '1' }] })!;
    const next = withZeldOutpoints(entries, ADDRESS, { add: [{ outpoint: B }], remove: [A] })!;
    expect(knownZeldOutpoints(next, ADDRESS)).toEqual([{ outpoint: B }]);
  });

  it('keeps at most the most recent outpoints per address', () => {
    const many = Array.from({ length: MAX_ZELD_OUTPOINTS_PER_ADDRESS + 5 }, (_, index) => ({
      outpoint: `${index.toString(16).padStart(64, '0')}:0`, balance: '1',
    }));
    const entries = withZeldOutpoints([], ADDRESS, { replace: many })!;
    expect(entries).toHaveLength(MAX_ZELD_OUTPOINTS_PER_ADDRESS);
    expect(knownZeldOutpoints(entries, ADDRESS)[0]!.outpoint).toBe(many[5]!.outpoint);
  });

  it('drops malformed stored entries and refuses malformed updates', () => {
    expect(sanitizeZeldOutpointEntries([`${ADDRESS} ${A} 1`, 'junk', 7, `${ADDRESS} ${B} ?`]))
      .toEqual([`${ADDRESS} ${A} 1`, `${ADDRESS} ${B} ?`]);
    expect(sanitizeZeldOutpointEntries('nope')).toEqual([]);
    expect(() => parseZeldOutpointUpdate({ add: [{ outpoint: 'x:0' }] })).toThrow();
    expect(() => parseZeldOutpointUpdate({ remove: 'all' })).toThrow();
    expect(parseZeldOutpointUpdate({ add: [{ outpoint: A.toUpperCase(), balance: '-1' }] }))
      .toEqual({ add: [{ outpoint: A }] });
  });
});

describe('what the wallet\'s own broadcast leaves in the record', () => {
  const otherScript = hexToBytes('0014' + '7'.repeat(40));
  const spent = `${PREV_TXID}:0`;

  it('moves a send\'s remainder onto its change and forgets the spent outputs', () => {
    const raw = unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 0 }],
      outputs: [
        { script: SOURCE_P2WPKH.script, amount: 90_000n },
        { script: otherScript, amount: 330n },
        { script: opReturnScript(), amount: 0n },
      ],
    });
    const txid = parseRawTransactionLocally(raw)!.txid;
    const update = zeldRecordAfterBroadcast(raw, SOURCE_ADDRESS, {
      zeld_send: { spent_outpoints: [spent], remainder_base_units: '40', amount_base_units: '60', change_vout: 0, recipient_vout: 1 },
    });
    expect(update).toEqual({ add: [{ outpoint: `${txid}:0`, balance: '40' }], remove: [spent] });
  });

  it('records ZELD carried forward onto the source\'s first output with the amount left to the indexer', () => {
    const raw = unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 0 }],
      outputs: [{ script: opReturnScript(), amount: 0n }, { script: SOURCE_P2WPKH.script, amount: 90_000n }],
    });
    const txid = parseRawTransactionLocally(raw)!.txid;
    expect(zeldRecordAfterBroadcast(raw, SOURCE_ADDRESS, { zeld_protection: { carried_forward: [spent] } }))
      .toEqual({ add: [{ outpoint: `${txid}:1` }], remove: [spent] });
  });

  it('touches nothing for a transaction without ZELD', () => {
    const raw = unsignedRawTx({
      inputs: [{ txid: 'ab' + PREV_TXID.slice(2), index: 0 }],
      outputs: [{ script: otherScript, amount: 5_000n }],
    });
    expect(zeldRecordAfterBroadcast(raw, SOURCE_ADDRESS, {})).toBeNull();
  });
});
