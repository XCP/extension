/**
 * Builds an unsigned raw transaction that funds a bare multisig (P2MS) output.
 *
 * The signed result comes from walletService.signTransaction() which already
 * handles bare multisig outputs via signWithBareMultisigOutputs().
 */

import { RawTx, OutScript, Address, NETWORK } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { selectUtxosForTransaction } from '@/utils/blockchain/counterparty/utxo-selection';
import { getInputSizeForAddress } from '@/utils/blockchain/bitcoin/fee-estimation';

export interface BuildBareMultisigFundingParams {
  pubkeys: Uint8Array[];
  m: number;
  amountSats: number;
  feeRate: number;
  sourceAddress: string;
}

export interface BuildBareMultisigFundingResult {
  unsignedTxHex: string;
  multisigScriptHex: string;
  fee: number;
  changeAmount: number;
}

const DUST_LIMIT = 546;

/**
 * Validates a hex-encoded public key string and returns the byte array.
 * Accepts compressed (33 bytes, prefix 02/03) or uncompressed (65 bytes, prefix 04).
 */
export function validatePubkey(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;

  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`Invalid hex characters in pubkey: ${hex}`);
  }

  if (clean.length !== 66 && clean.length !== 130) {
    throw new Error(
      `Invalid pubkey length: expected 66 (compressed) or 130 (uncompressed) hex chars, got ${clean.length}`
    );
  }

  const prefix = clean.slice(0, 2).toLowerCase();
  if (clean.length === 66 && prefix !== '02' && prefix !== '03') {
    throw new Error(`Invalid compressed pubkey prefix: expected 02 or 03, got ${prefix}`);
  }
  if (clean.length === 130 && prefix !== '04') {
    throw new Error(`Invalid uncompressed pubkey prefix: expected 04, got ${prefix}`);
  }

  return hexToBytes(clean);
}

/**
 * Returns the change output size in bytes based on address type.
 */
function getChangeOutputSize(address: string): number {
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) return 43; // P2TR
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) return 31; // P2WPKH
  if (address.startsWith('3') || address.startsWith('2')) return 32;      // P2SH
  return 34; // P2PKH
}

/**
 * Builds an unsigned transaction that creates a bare multisig (P2MS) output.
 */
export async function buildBareMultisigFunding(
  params: BuildBareMultisigFundingParams
): Promise<BuildBareMultisigFundingResult> {
  const { pubkeys, m, amountSats, feeRate, sourceAddress } = params;

  if (pubkeys.length < 2 || pubkeys.length > 3) {
    throw new Error('Bare multisig requires 2 or 3 public keys');
  }
  if (m < 1 || m > pubkeys.length) {
    throw new Error(`m must be between 1 and ${pubkeys.length}`);
  }
  if (amountSats <= 0) {
    throw new Error('Amount must be positive');
  }
  if (feeRate <= 0) {
    throw new Error('Fee rate must be positive');
  }

  // Build P2MS output script
  const multisigScript = OutScript.encode({ type: 'ms', pubkeys, m });

  // Build change script from source address
  const decoded = Address(NETWORK).decode(sourceAddress);
  const changeScript = OutScript.encode(decoded);

  // Fetch UTXOs
  const { utxos } = await selectUtxosForTransaction(sourceAddress, {
    allowUnconfirmed: true,
  });

  if (utxos.length === 0) {
    throw new Error('No UTXOs available');
  }

  // utxos are already sorted highest-first by selectUtxosForTransaction
  const inputSize = getInputSizeForAddress(sourceAddress);
  const multisigOutputSize = 8 + 1 + multisigScript.length;
  const changeOutputSize = getChangeOutputSize(sourceAddress);
  const overhead = 10;

  // Coin selection: accumulate inputs until we cover amount + fee
  const selectedUtxos: typeof utxos = [];
  let totalInput = 0;

  for (const utxo of utxos) {
    selectedUtxos.push(utxo);
    totalInput += utxo.value;

    const vsizeWithChange = overhead
      + selectedUtxos.length * inputSize
      + multisigOutputSize
      + changeOutputSize;
    const feeWithChange = Math.ceil(vsizeWithChange * feeRate);

    if (totalInput >= amountSats + feeWithChange) {
      break;
    }
  }

  // Determine outputs, fee, and change
  const vsizeWithChange = overhead
    + selectedUtxos.length * inputSize
    + multisigOutputSize
    + changeOutputSize;
  const feeWithChange = Math.ceil(vsizeWithChange * feeRate);

  let fee: number;
  let changeAmount: number;
  const outputs: { amount: bigint; script: Uint8Array }[] = [
    { amount: BigInt(amountSats), script: multisigScript },
  ];

  if (totalInput < amountSats + feeWithChange) {
    // Can't afford a change output — check if we can cover without one
    const vsizeNoChange = overhead
      + selectedUtxos.length * inputSize
      + multisigOutputSize;
    const feeNoChange = Math.ceil(vsizeNoChange * feeRate);

    if (totalInput < amountSats + feeNoChange) {
      throw new Error(
        `Insufficient funds: have ${totalInput} sats, need ${amountSats + feeNoChange} sats (including fee)`
      );
    }

    fee = totalInput - amountSats;
    changeAmount = 0;
  } else {
    const change = totalInput - amountSats - feeWithChange;

    if (change < DUST_LIMIT) {
      // Dust change — fold into fee
      fee = totalInput - amountSats;
      changeAmount = 0;
    } else {
      outputs.push({ amount: BigInt(change), script: changeScript });
      fee = feeWithChange;
      changeAmount = change;
    }
  }

  const encoded = RawTx.encode({
    version: 2,
    segwitFlag: false,
    inputs: selectedUtxos.map(utxo => ({
      txid: hexToBytes(utxo.txid),
      index: utxo.vout,
      finalScriptSig: new Uint8Array(0),
      sequence: 0xfffffffd,
    })),
    outputs,
    witnesses: [],
    lockTime: 0,
  });

  return {
    unsignedTxHex: bytesToHex(encoded),
    multisigScriptHex: bytesToHex(multisigScript),
    fee,
    changeAmount,
  };
}
