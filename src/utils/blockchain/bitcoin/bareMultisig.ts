import { Transaction, SigHash, OutScript } from '@scure/btc-signer';
import { quickApiClient, API_TIMEOUTS } from '@/utils/api/axiosConfig';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';
import { toSatoshis } from '@/utils/numeric';
import { hybridSignTransaction } from '@/utils/blockchain/bitcoin';


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
    const amountSats = BigInt(toSatoshis(utxo.amount));

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

  // Collect redeem scripts for each input (for bare multisig, the redeemScript is the scriptPubKey)
  const prevOutputScripts: Uint8Array[] = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    if (!input.redeemScript) {
      throw new Error(`Missing redeemScript for input ${i}`);
    }
    prevOutputScripts.push(input.redeemScript);
  }

  // Check function to determine if an input needs uncompressed signing
  const checkForUncompressed = (idx: number): boolean => {
    const input = tx.getInput(idx);
    if (!input.redeemScript) return false;
    
    const decoded = OutScript.decode(input.redeemScript);
    if (decoded.type !== 'ms') return false;
    
    const pubkeysHex = decoded.pubkeys.map((pk: Uint8Array) => bytesToHex(pk));
    return pubkeysHex.includes(bytesToHex(publicKeyUncompressed));
  };

  // Use hybrid signing from shared utility
  hybridSignTransaction(
    tx,
    privateKeyBytes,
    publicKeyCompressed,
    publicKeyUncompressed,
    prevOutputScripts,
    checkForUncompressed
  );

  // Finalize the transaction (build final unlocking scripts).
  tx.finalize();

  const signedTx = tx.hex;
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
  const response = await quickApiClient.get<{ data: any[] }>(`https://app.xcp.io/api/v1/address/${address}/utxos`);
  const utxos = response.data.data;
  if (!utxos || utxos.length === 0) throw new Error('No bare multisig UTXOs found');
  return utxos.map((utxo: any) => ({
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
      const url = typeof endpoint.url === 'function' ? await endpoint.url() : endpoint.url;
      // Use quickApiClient with 10 second timeout for transaction lookups
      const response = await quickApiClient.get(url);
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
