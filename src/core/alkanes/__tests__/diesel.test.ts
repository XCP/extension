import { describe, expect, it } from 'vitest';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import {
  buildDieselMintScript,
  buildDieselTransferScript,
  decodeDieselMintScript,
  dieselUtxoMinimumSats,
  isSupportedDieselUtxoAddress,
  shouldAttachDieselMint,
} from '../diesel';

// Exact signed bytes mined by Bitcoin Core and indexed as a valid enhanced send by Counterparty
// Core 11.3 on the companion regtest stack. The same bytes are also consumed by the Alkanes
// consensus-indexer regression, keeping the two protocol proofs tied to one immutable fixture.
const DUAL_PROTOCOL_REGTEST_TX = '02000000000101dfe53210dda7a99212cb9573932494c4bc4288070a673c2f861a8d57bbe6deb30100000000ffffffff0300000000000000002e6a2c2cb936f095ea4e99869245f9d0f526dd518676596041533f70693f241df5b72e5cfb49cd9e346334d2715df69d9d120000000000160014de0c9e5ed89dacd4a2005e6f8c1d0869be73f6900000000000000000116a5d0eff7f818cec8ad0abc0a88281d2150247304402205e1435638c11499505fa28732fa0f609188a96230fbe9caa0e07572c2f41046a0220267e730d81c81580024233b0c347f7160a91b6a1d7ee19d3343c30b21c491f590121020602c4da8f2999aafd947655b7192eb205fa3ef2f2d135c4149e68dcafb65a0200000000';

describe('DIESEL mint protostone', () => {
  it('reproduces the independently decoded canonical vout-0 script', () => {
    expect(buildDieselMintScript(0)).toBe('6a5d0eff7f818cec82d08bc0a88281d215');
  });

  it('repoints both successful mints and refunds to the wallet output', () => {
    const script = buildDieselMintScript(1);
    expect(script).toBe('6a5d0eff7f818cec8ad0abc0a88281d215');
    expect(decodeDieselMintScript(script)).toEqual({
      pointer: 1,
      refund: 1,
      calldata: [2n, 0n, 77n],
    });
  });

  it('locks the exact raw transaction accepted by both protocol consensus paths', () => {
    const parsed = parseRawTransactionLocally(DUAL_PROTOCOL_REGTEST_TX);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      txid: '3a930995f7eac57afa17dd39424836cf64c06e35921dd9021234f8948cbe31f7',
      vsize: 191,
      outputs: [
        { index: 0, value: 0, type: 'op_return' },
        { index: 1, value: 1_219_997, type: 'address' },
        {
          index: 2,
          value: 0,
          type: 'op_return',
          opReturnData: buildDieselMintScript(1),
        },
      ],
    });
    expect(decodeDieselMintScript(parsed!.outputs[2]!.opReturnData!)).toEqual({
      pointer: 1,
      refund: 1,
      calldata: [2n, 0n, 77n],
    });
  });

  it('rejects a malformed or unrelated OP_RETURN', () => {
    expect(() => decodeDieselMintScript('6a026869')).toThrow('Not an Alkanes runestone');
    expect(() => decodeDieselMintScript('6a5d0eff7f')).toThrow('Invalid runestone payload length');
  });

  it('matches the alkanes-rs SDK vector for an edict with wallet remainder', () => {
    // Cross-checked against ts-sdk ProtoStone({ pointer: 1, edicts: [2:0, 1.25, vout 0] }).
    expect(buildDieselTransferScript(125_000_000n, 0, 1)).toBe(
      '6a5d0fff7f818eec8a80c08080c0e5b6de03',
    );
  });

  it('allows the four standard single-key wallet address families proved on regtest', () => {
    expect(isSupportedDieselUtxoAddress('bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l')).toBe(true);
    expect(isSupportedDieselUtxoAddress('bc1qwqdg6squsna38e46795at95yu9atm8azzmyvckulcc7kytlcckxswvvzej')).toBe(false);
    expect(isSupportedDieselUtxoAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
    expect(isSupportedDieselUtxoAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
    expect(isSupportedDieselUtxoAddress('bcrt1p34lk9xmq7hctcp6s252ha0q8nypwggwrevlwsaueej4gszea0zgq3rjw9l')).toBe(true);
    expect(dieselUtxoMinimumSats('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(546);
    expect(dieselUtxoMinimumSats('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(540);
    expect(dieselUtxoMinimumSats('bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l')).toBe(330);
  });

  it('uses one inclusive policy gate for supported send and attach composes', () => {
    const sourceAddress = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
    const base = { enabled: true, sourceAddress, feeRate: 2, maximumFeeRate: 2 };
    expect(shouldAttachDieselMint(base)).toBe(true);
    expect(shouldAttachDieselMint({ ...base, feeRate: 2.01 })).toBe(false);
    expect(shouldAttachDieselMint({ ...base, encoding: 'multisig' })).toBe(false);
    expect(shouldAttachDieselMint({ ...base, enabled: false })).toBe(false);
    expect(shouldAttachDieselMint({ ...base, feeRate: Number.NaN })).toBe(false);
  });
});
