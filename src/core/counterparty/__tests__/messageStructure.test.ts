/**
 * These checks exist because a payload can be internally perfect and still describe something the
 * transaction cannot do. Neither the API comparison (which never looks at the transaction) nor the
 * repack proof (which only shows the decode explains every payload byte) would notice.
 */

import { describe, expect, it } from 'vitest';
import { checkMessageStructure } from '@/core/counterparty/messageStructure';

const TXID = '3f7b5cb0889cfe00ec42c1484411487fbdf5837246cd016784ffba6e9f44a5d6';

const tx = {
  inputs: [{ txid: TXID, vout: 2 }],
  outputs: [{ index: 0 }, { index: 1 }],
};

describe('attach', () => {
  it('accepts a vout the transaction actually has', () => {
    expect(checkMessageStructure('attach', { destinationVout: 1 }, tx)).toEqual([]);
  });

  it('flags a vout past the end of the outputs', () => {
    // core builds the destination as `${tx_hash}:${destination_vout}`, so this names a UTXO that
    // will never exist.
    const found = checkMessageStructure('attach', { destinationVout: 7 }, tx);
    expect(found).toHaveLength(1);
    expect(found[0]!.title).toMatch(/does not exist/i);
  });

  it('says nothing when the message carries no vout', () => {
    expect(checkMessageStructure('attach', { asset: 'XCP' }, tx)).toEqual([]);
  });
});

describe('utxo move', () => {
  it('accepts a source among the inputs being signed', () => {
    expect(checkMessageStructure('utxo', { source: `${TXID}:2` }, tx)).toEqual([]);
  });

  it('flags a source the transaction does not spend', () => {
    const found = checkMessageStructure('utxo', { source: `${TXID}:3` }, tx);
    expect(found).toHaveLength(1);
    expect(found[0]!.title).toMatch(/does not spend/i);
  });

  it('flags a source naming an entirely different transaction', () => {
    const other = 'a'.repeat(64);
    expect(checkMessageStructure('utxo_move', { source: `${other}:2` }, tx)).toHaveLength(1);
  });
});

describe('scope', () => {
  it('says nothing for types that make no structural claim', () => {
    expect(checkMessageStructure('enhanced_send', { asset: 'XCP' }, tx)).toEqual([]);
    expect(checkMessageStructure(undefined, {}, tx)).toEqual([]);
  });
});
