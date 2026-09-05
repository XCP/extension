import { describe, expect, it } from 'vitest';
import { type CborEncodable, encodeCbor } from '@/core/counterparty/pack/cbor';
import { unpackCounterpartyMessage } from '../index';

// Core unpack_new reads fields[:17], then defaults an absent MIME type and description:
// https://github.com/CounterpartyXCP/counterparty-core/blob/master/counterparty-core/counterpartycore/lib/messages/fairminter.py#L397
const required: CborEncodable[] = [
  26n ** 12n + 1_000n, 0n, 100_000_000n, 1n, 100n, 500n, 1_000n, 0n,
  961_200n, 963_000n, 500n, 962_500n, 0n, false, true, false, false,
];

function decode(tail: CborEncodable[]) {
  return unpackCounterpartyMessage(new Uint8Array([
    ...new TextEncoder().encode('CNTRPRTY'), 90, ...encodeCbor([...required, ...tail]),
  ]));
}

describe('fairminter optional content follows core field-count defaults', () => {
  it('accepts 17 fields with no MIME type or description', () => {
    expect(decode([])).toMatchObject({
      success: true, messageType: 'fairminter',
      data: { mimeType: '', description: '', poolQuantity: 0n, lpAsset: null, price: 100_000_000n },
    });
  });

  it.each(['', 'text/plain', 'image/png'])('accepts 18 fields while retaining MIME type %j', (mimeType) => {
    expect(decode([mimeType])).toMatchObject({
      success: true, data: { mimeType, description: '', poolQuantity: 0n, lpAsset: null },
    });
  });

  it.each([[null], ['text/plain', null]] satisfies CborEncodable[][])(
    'rejects a present malformed content field instead of treating it as absent: %j', (...tail) => {
      expect(decode(tail).success).toBe(false);
    },
  );
});
