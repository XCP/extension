import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeMoneyMovement } from '@/components/domain/approval/money-movement';
import { AddressFormat, decodeAddressFromScript } from '@/core/bitcoin/address';
import type { BitcoinPaymentIntentV1 } from '@/core/bitcoin/providerPayment';
import { extractPsbtDetails, finalizePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import { shouldBlockSigning } from '@/core/counterparty/unpack/providerVerify';

const { remoteDecode } = vi.hoisted(() => ({ remoteDecode: vi.fn() }));
vi.mock('@/core/counterparty/transaction', async (original) => ({
  ...(await original<typeof import('@/core/counterparty/transaction')>()),
  decodeRawTransaction: remoteDecode,
}));
vi.mock('@/core/counterparty/api', async (original) => ({
  ...(await original<typeof import('@/core/counterparty/api')>()),
  fetchUtxoBalances: vi.fn().mockResolvedValue({ result: [] }),
}));

const privateKey = '01'.padStart(64, '0');
const signer = p2wpkh(getPublicKey(hexToBytes(privateKey)));
const merchant = p2wpkh(getPublicKey(hexToBytes('02'.padStart(64, '0'))));
const attackerKey = getPublicKey(hexToBytes('03'.padStart(64, '0')));
const intent: BitcoinPaymentIntentV1 = {
  standard: 'xcp-wallet/bitcoin-payment', version: 1, action: 'pay',
  outputs: [{ address: merchant.address, amountSats: 1_000 }],
};

function payment(extraScript: Uint8Array) {
  const tx = new Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true });
  tx.addInput({ txid: '11'.repeat(32), index: 0, witnessUtxo: { script: signer.script, amount: 100_000n } });
  tx.addOutput({ script: merchant.script, amount: 1_000n });
  tx.addOutput({ script: extraScript, amount: 98_000n });
  return bytesToHex(tx.toPSBT());
}

describe('PSBT approval output integrity', () => {
  beforeEach(() => {
    remoteDecode.mockReset();
    // A hostile decode endpoint claims the second output is the signer's change.
    remoteDecode.mockResolvedValue({ vout: [{ n: 1, scriptPubKey: { address: signer.address } }] });
  });

  it.each([
    ['standard external', p2wpkh(attackerKey).script],
    ['locally unresolved P2PK', hexToBytes(`21${bytesToHex(attackerKey)}ac`)],
  ] as const)('blocks an undeclared %s output even if the decode API calls it change', async (_, script) => {
    const psbtHex = payment(script);
    const decoded = await decodePsbtForApproval(
      psbtHex, [signer.address], [0], [1], undefined, 'bitcoin-payment', intent,
    );
    expect(remoteDecode).not.toHaveBeenCalled();
    expect(decoded.psbtDetails.outputs[1]?.address).toBe(decodeAddressFromScript(bytesToHex(script)) ?? undefined);
    expect(decoded.bitcoinPaymentProof?.proved).toBe(false);
    expect(shouldBlockSigning({
      safetyBlocked: decoded.safety.blocked,
      verificationPassed: decoded.verification.passed,
      repackProved: decoded.verification.repackProved,
      strictMode: true,
    })).toBe(true);
    const movement = computeMoneyMovement({
      inputs: decoded.psbtDetails.inputs, outputs: decoded.psbtDetails.outputs,
      myAddresses: [signer.address], fee: decoded.psbtDetails.fee, committedOutputs: null,
    });
    expect(movement.backToYou).toBe(0);
    expect(movement.external).toHaveLength(2);
    expect(movement.net).toBe(-100_000);

    // This is spendable, not a malformed PSBT rejected by cryptography. Policy must block it
    // before invoking the otherwise-capable signer.
    const signed = signPSBT(psbtHex, privateKey, [0], AddressFormat.P2WPKH, [1]);
    const finalized = Transaction.fromRaw(hexToBytes(finalizePSBT(signed)), {
      allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true,
    });
    expect(finalized.getOutput(1).amount).toBe(98_000n);
    expect(bytesToHex(finalized.getOutput(1).script!)).toBe(bytesToHex(script));
    expect(finalized.getInput(0).finalScriptWitness?.length).toBeGreaterThan(0);
  });

  it('proves genuine script-derived change without a remote Bitcoin decode', async () => {
    const psbtHex = payment(signer.script);
    const decoded = await decodePsbtForApproval(
      psbtHex, [signer.address], [0], [1], undefined, 'bitcoin-payment', intent,
    );
    expect(remoteDecode).not.toHaveBeenCalled();
    expect(decoded.psbtDetails.transactionId).toBe(extractPsbtDetails(psbtHex).transactionId);
    expect(decoded.bitcoinPaymentProof).toMatchObject({ proved: true, totalSats: 1_000, errors: [] });
    expect(decoded.safety.blocked).toBe(false);
  });
});
