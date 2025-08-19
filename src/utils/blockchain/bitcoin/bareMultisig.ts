import axios from 'axios';
import { Transaction, SigHash, OutScript } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';
import { signECDSA } from '@scure/btc-signer/utils';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';

/**
 * Re-implementation of concatBytes.
 * Concatenates an arbitrary number of Uint8Arrays into a single Uint8Array.
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Signs a single input using the legacy (non-witness) preimage routine.
 * This routine bypasses the built-in signing (which only handles compressed keys)
 * by calling the internal preimage routine (via a cast to any) and then signing with
 * an uncompressed public key.
 */
function customSignInput(
  tx: Transaction,
  idx: number,
  privateKey: Uint8Array,
  sighash: number = SigHash.ALL
): void {
  const input = tx.getInput(idx);
  if (!input.redeemScript)
    throw new Error(`Missing redeemScript for input ${idx}`);

  // Access the transaction's legacy preimage routine.
  // preimageLegacy is a private method so we cast tx as any.
  const preimageLegacy = (tx as any).preimageLegacy;
  if (typeof preimageLegacy !== 'function')
    throw new Error('preimageLegacy method not accessible');
  const hash: Uint8Array = preimageLegacy.call(tx, idx, input.redeemScript, sighash);

  // Sign the hash using signECDSA (imported directly).
  const sig: Uint8Array = signECDSA(hash, privateKey, (tx as any).opts.lowR);

  // Append the sighash type byte.
  const sigWithHash: Uint8Array = concatBytes(
    sig,
    new Uint8Array([sighash !== SigHash.DEFAULT ? sighash : 0])
  );

  // Get the uncompressed public key.
  const uncompressedPubKey: Uint8Array = getPublicKey(privateKey, false);

  // Update this input's partial signature so that finalize() later produces the correct unlocking script.
  tx.updateInput(idx, { partialSig: [[uncompressedPubKey, sigWithHash]] }, true);
}

/**
 * Hybrid signing:
 * First attempt the built-in tx.sign(), then for any still-unsigned inputs whose redeem
 * script contains our uncompressed public key, use customSignInput().
 */
function hybridSignTransaction(
  tx: Transaction,
  privateKey: Uint8Array,
  publicKeyCompressed: Uint8Array,
  publicKeyUncompressed: Uint8Array
): void {
  // Attempt built-in signing.
  try {
    tx.sign(privateKey);
  } catch (e) {
    console.error('Library sign encountered errors; proceeding with hybrid signing:', e);
  }
  // Now iterate over inputs that remain unsigned.
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    if (input.partialSig && input.partialSig.length > 0) continue;
    if (!input.redeemScript) continue;
    const decoded = OutScript.decode(input.redeemScript);
    // Only handle bare multisig inputs.
    if (decoded.type !== 'ms') continue;
    const pubkeysHex = decoded.pubkeys.map((pk: Uint8Array) => bytesToHex(pk));
    // If the redeem script contains our uncompressed key, call our custom signing.
    if (pubkeysHex.includes(bytesToHex(publicKeyUncompressed))) {
      customSignInput(tx, i, privateKey, SigHash.ALL);
    }
  }
}

/**
 * Main consolidator function.
 * Fetches bare multisig UTXOs, creates a new transaction consolidating them, and signs
 * the transaction using hybrid signing (using both the built-in sign() and our custom fallback).
 */
export async function consolidateBareMultisig(
  privateKeyHex: string,
  sourceAddress: string,
  feeRateSatPerVByte: number,
  destinationAddress?: string,
): Promise<string> {
  const targetAddress = destinationAddress || sourceAddress;

  if (!privateKeyHex) throw new Error('Private key not found');
  const privateKeyBytes = hexToBytes(privateKeyHex);

  // Generate both compressed and uncompressed public keys.
  const publicKeyCompressed: Uint8Array = getPublicKey(privateKeyBytes, true);
  const publicKeyCompressedHex = bytesToHex(publicKeyCompressed);

  const publicKeyUncompressed: Uint8Array = getPublicKey(privateKeyBytes, false);
  const publicKeyUncompressedHex = bytesToHex(publicKeyUncompressed);

  const utxos = await fetchBareMultisigUTXOs(sourceAddress);
  if (utxos.length === 0) throw new Error('No bare multisig UTXOs found');

  const tx = new Transaction({ disableScriptCheck: true });
  const prevTxCache = new Map<string, string>();

  let totalInputAmount = 0n;
  for (const utxo of utxos) {
    const amountSats = BigInt(Math.round(utxo.amount * 1e8));

    let prevTxHex = prevTxCache.get(utxo.txid);
    if (!prevTxHex) {
      const fetchedHex = await fetchPreviousRawTransaction(utxo.txid);
      if (!fetchedHex) {
        console.warn(`Skipping UTXO ${utxo.txid}:${utxo.vout}, no prevTx`);
        continue;
      }
      prevTxHex = fetchedHex;
      prevTxCache.set(utxo.txid, prevTxHex);
    }

    const scriptPubKey = hexToBytes(utxo.scriptPubKeyHex);
    const decoded = OutScript.decode(scriptPubKey);
    if (decoded.type !== 'ms') continue; // Not a multisig script.
    const pubkeys = decoded.pubkeys;
    // Accept UTXOs if the multisig redeem script contains either our compressed or uncompressed pubkey.
    const hasOurKey = pubkeys.some((pk: Uint8Array) =>
      bytesToHex(pk) === publicKeyCompressedHex ||
      bytesToHex(pk) === publicKeyUncompressedHex
    );
    if (!hasOurKey) continue;

    // Add the input.
    tx.addInput({
      txid: hexToBytes(utxo.txid),
      index: utxo.vout,
      sequence: 0xfffffffd, // Enable RBF.
      nonWitnessUtxo: hexToBytes(prevTxHex),
      // For bare multisig, the redeemScript is identical to the scriptPubKey.
      redeemScript: scriptPubKey,
    });
    totalInputAmount += amountSats;
  }

  if (tx.inputsLength === 0) throw new Error('No suitable UTXOs after filtering.');

  const feeRate = BigInt(feeRateSatPerVByte);
  const estimatedSize = BigInt(estimateTransactionSize(tx.inputsLength, 1));
  const fee = estimatedSize * feeRate;
  const outputAmount = totalInputAmount - fee;
  if (outputAmount <= 0n) throw new Error('Insufficient funds');

  tx.addOutputAddress(targetAddress, outputAmount);

  // Hybrid sign: first try built-in signing, then custom-sign any inputs that need uncompressed keys.
  hybridSignTransaction(tx, privateKeyBytes, publicKeyCompressed, publicKeyUncompressed);

  // Finalize the transaction (build final unlocking scripts).
  tx.finalize();

  const signedTx = tx.hex;
  console.log('Transaction signed successfully with hybrid signing logic.');
  return signedTx;
}

/* ───────── Helper Functions ───────── */

/**
 * Roughly estimates a transaction's size in bytes.
 */
function estimateTransactionSize(numInputs: number, numOutputs: number): number {
  let size = 8; // version (4 bytes) + locktime (4 bytes)
  size += varIntSize(numInputs);
  // For each input, add an approximate size.
  for (let i = 0; i < numInputs; i++) {
    // For bare multisig, assume a scriptSig of: OP_0 + signature (roughly 74 bytes).
    const signaturesSize = 74;
    size += 36 + varIntSize(signaturesSize) + signaturesSize + 4;
  }
  size += varIntSize(numOutputs);
  // For each output, assume 8 (amount) + varint for script length + 25 bytes script.
  for (let i = 0; i < numOutputs; i++) {
    size += 8 + varIntSize(25) + 25;
  }
  return size;
}

/**
 * Returns the number of bytes used to encode a variable-length integer.
 */
function varIntSize(n: number): number {
  if (n < 0xfd) return 1;
  else if (n <= 0xffff) return 3;
  else if (n <= 0xffffffff) return 5;
  else return 9;
}

/**
 * Fetch bare multisig UTXOs for the given address.
 */
async function fetchBareMultisigUTXOs(address: string): Promise<UTXO[]> {
  const response = await axios.get<{ data: any[] }>(`https://app.xcp.io/api/v1/address/${address}/utxos`);
  const utxos = response.data.data;
  if (!utxos || utxos.length === 0) throw new Error('No bare multisig UTXOs found');
  return utxos.map((utxo) => ({
    txid: utxo.txid,
    vout: utxo.vout,
    amount: parseFloat(utxo.amount),
    scriptPubKeyHex: utxo.scriptPubKeyHex,
    scriptPubKeyType: utxo.scriptPubKeyType,
    requiredSignatures: utxo.required_signatures || 1,
  }));
}

/**
 * Fetch a previous transaction's raw hex given its txid.
 */
async function fetchPreviousRawTransaction(txid: string): Promise<string | null> {
  const endpoints = [
    { url: `https://blockstream.info/api/tx/${txid}/hex`, transform: (d: string) => d.trim() },
    { url: `https://mempool.space/api/tx/${txid}/hex`, transform: (d: string) => d.trim() },
    { url: async () => {
      const settings = await getKeychainSettings();
      return `${settings.counterpartyApiBase}/v2/bitcoin/transactions/${txid}`;
    }, transform: (d: any) => d.result.hex },
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get<any>(typeof endpoint.url === 'function' ? await endpoint.url() : endpoint.url);
      return endpoint.transform(response.data);
    } catch (_) {
      continue;
    }
  }
  return null;
}

/**
 * UTXO interface.
 */
interface UTXO {
  txid: string;
  vout: number;
  amount: number; // in BTC
  scriptPubKeyHex: string;
  scriptPubKeyType?: string;
  requiredSignatures?: number;
}
