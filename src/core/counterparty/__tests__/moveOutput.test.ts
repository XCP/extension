import { Address, OutScript, p2pkh, p2sh, p2tr } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { OTHER_ADDRESS, PUBKEY, SOURCE_ADDRESS, SOURCE_P2WPKH, unsignedRawTx } from '@/core/zeld/__tests__/fixtures';
import { assertMoveOutputs, moveOutputSats } from '../moveOutput';

const recipient = OutScript.encode(Address().decode(OTHER_ADDRESS));
const move = (amount: bigint, change = 4878n, sameAddress = false) => unsignedRawTx({
  outputs: [
    { script: sameAddress ? SOURCE_P2WPKH.script : recipient, amount },
    { script: SOURCE_P2WPKH.script, amount: change },
  ],
});

describe('small asset move outputs', () => {
  it('uses 330 sats for native SegWit and Taproot, and relayable amounts for legacy addresses', () => {
    expect(moveOutputSats(OTHER_ADDRESS)).toBe(330);
    expect(moveOutputSats(p2tr(PUBKEY.slice(1)).address!)).toBe(330);
    expect(moveOutputSats(p2pkh(PUBKEY).address!)).toBe(546);
    expect(moveOutputSats(p2sh(SOURCE_P2WPKH).address!)).toBe(540);
  });

  it('returns the excess from a 5,408-sat asset output separately (330 + 4,878 + 200 fee)', () => {
    expect(() => assertMoveOutputs(move(330n), OTHER_ADDRESS, SOURCE_ADDRESS)).not.toThrow();
  });

  it('accepts the live unsigned BBOYPEPE self-move: 330 asset, 4,937 change, 141 fee', () => {
    const owner = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
    const raw = '02000000018b42eae4d80445e91fc3a001adc284efdc8d36d1cbe7f15d25c8753d3bce484c0000000000ffffffff024a010000000000001600145c333992ab554e7573df3d2a412df750a60d1f5b49130000000000001600145c333992ab554e7573df3d2a412df750a60d1f5b00000000';
    expect(() => assertMoveOutputs(raw, owner, owner)).not.toThrow();
  });

  it('allows reclaiming excess BTC by moving to the same address', () => {
    expect(() => assertMoveOutputs(move(330n, 4878n, true), SOURCE_ADDRESS, SOURCE_ADDRESS)).not.toThrow();
  });

  it('rejects the observed single-output 5,408-sat transfer even when sent to self', () => {
    const raw = unsignedRawTx({ outputs: [{ script: SOURCE_P2WPKH.script, amount: 5408n }] });
    expect(() => assertMoveOutputs(raw, SOURCE_ADDRESS, SOURCE_ADDRESS)).toThrow('small output');
  });

  it('rejects preserved oversized postage, dust, or fee deductions from the asset output', () => {
    for (const amount of [5408n, 546n, 329n, 0n]) {
      expect(() => assertMoveOutputs(move(amount), OTHER_ADDRESS, SOURCE_ADDRESS)).toThrow('small output');
    }
  });

  it('rejects change preceding the recipient, a wrong recipient, and redirected change', () => {
    expect(() => assertMoveOutputs(move(330n), SOURCE_ADDRESS, SOURCE_ADDRESS)).toThrow('small output');
    const raw = unsignedRawTx({ outputs: [
      { script: recipient, amount: 330n },
      { script: recipient, amount: 4878n },
    ] });
    expect(() => assertMoveOutputs(raw, OTHER_ADDRESS, SOURCE_ADDRESS)).toThrow('sending address');
    const reversed = unsignedRawTx({ outputs: [
      { script: SOURCE_P2WPKH.script, amount: 4878n },
      { script: recipient, amount: 330n },
    ] });
    expect(() => assertMoveOutputs(reversed, OTHER_ADDRESS, SOURCE_ADDRESS)).toThrow('small output');
  });

  it('allows no change when the remainder pays the fee, and rejects malformed responses', () => {
    const raw = unsignedRawTx({ outputs: [{ script: recipient, amount: 330n }] });
    expect(() => assertMoveOutputs(raw, OTHER_ADDRESS, SOURCE_ADDRESS)).not.toThrow();
    expect(() => assertMoveOutputs('00', OTHER_ADDRESS, SOURCE_ADDRESS)).toThrow();
    expect(() => moveOutputSats('not-an-address')).toThrow('Invalid move destination');
    expect(() => assertMoveOutputs(move(330n), OTHER_ADDRESS, 'not-an-address')).toThrow('sending address');
  });
});
