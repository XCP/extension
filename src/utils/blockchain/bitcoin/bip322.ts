/**
 * BIP-322 Generic Signed Message Format Implementation
 *
 * Implements BIP-322 for verifying signed messages from Taproot and other address types
 * Reference: https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki
 */

import { sha256 } from '@noble/hashes/sha2';
import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import * as secp256k1 from '@noble/secp256k1';

// BIP-322 tagged hash prefix
const BIP322_TAG = 'BIP0322-signed-message';

/**
 * Create a BIP-322 tagged hash of a message
 * Tagged hash: sha256(sha256(tag) || sha256(tag) || message)
 */
export function bip322MessageHash(message: string): Uint8Array {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);

  // Create tag hash
  const tagHash = sha256(encoder.encode(BIP322_TAG));

  // Create tagged hash: sha256(tagHash || tagHash || message)
  const preimage = new Uint8Array(tagHash.length * 2 + messageBytes.length);
  preimage.set(tagHash, 0);
  preimage.set(tagHash, tagHash.length);
  preimage.set(messageBytes, tagHash.length * 2);

  return sha256(preimage);
}

/**
 * Create the "to_spend" virtual transaction for BIP-322
 * This transaction has a single output with the script commitments
 */
export function createToSpendTransaction(
  messageHash: Uint8Array,
  scriptPubKey: Uint8Array
): btc.Transaction {
  const tx = new btc.Transaction();

  // Add a dummy input (0000...0000:0xFFFFFFFF)
  tx.addInput({
    txid: '0000000000000000000000000000000000000000000000000000000000000000',
    index: 0xFFFFFFFF,
    sequence: 0,
  });

  // Add output with the script and message commitment
  // The output script is: OP_RETURN <tagged_hash>
  const outputScript = btc.Script.encode([
    'RETURN',
    messageHash,
  ]);

  tx.addOutput({
    script: outputScript,
    amount: BigInt(0),
  });

  return tx;
}

/**
 * Create the "to_sign" virtual transaction for BIP-322
 * This spends from the to_spend transaction
 */
export function createToSignTransaction(
  toSpendTxId: string,
  scriptPubKey: Uint8Array
): btc.Transaction {
  const tx = new btc.Transaction();

  // Input spending from to_spend tx output 0
  tx.addInput({
    txid: toSpendTxId,
    index: 0,
    sequence: 0,
    witnessUtxo: {
      script: scriptPubKey,
      amount: BigInt(0),
    },
  });

  // Add OP_RETURN output (no actual output needed)
  tx.addOutput({
    script: btc.Script.encode(['RETURN']),
    amount: BigInt(0),
  });

  return tx;
}

/**
 * Verify a BIP-322 signature for a Taproot address
 */
export async function verifyBIP322Signature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  try {
    // Validate Taproot address
    if (!address.startsWith('bc1p') && !address.startsWith('tb1p')) {
      return false;
    }

    // Decode the address to get the witness program
    let witnessProgram: Uint8Array;
    try {
      // Parse bech32m address
      const network = address.startsWith('bc1') ? btc.NETWORK : btc.TEST_NETWORK;
      const decoded = btc.Address(network).decode(address);

      // Check if it's a Taproot address (P2TR)
      if (!decoded || decoded.type !== 'tr') {
        return false;
      }

      // Get the witness program (taproot output key)
      witnessProgram = decoded.pubkey;
    } catch {
      return false;
    }

    // Parse signature (expecting hex format after "tr:" prefix)
    let sigBytes: Uint8Array;
    if (signature.startsWith('tr:')) {
      const sigHex = signature.slice(3);
      if (sigHex.length !== 128) {
        return false;
      }
      sigBytes = hex.decode(sigHex);
    } else {
      return false;
    }

    // Create message hash
    const messageHash = bip322MessageHash(message);

    // Create script pubkey for P2TR
    const scriptPubKey = btc.Script.encode([
      'OP_1',
      witnessProgram,
    ]);

    // Create virtual transactions
    const toSpend = createToSpendTransaction(messageHash, scriptPubKey);
    const toSpendTxId = hex.encode(sha256(toSpend.toBytes()));
    const toSign = createToSignTransaction(toSpendTxId, scriptPubKey);

    // Get the signature hash for verification
    // For BIP-322, we need to get the hash of the virtual transaction
    // This is a simplified version - full BIP-322 would need complete transaction signing
    const sigHash = sha256(toSign.toBytes());

    // Verify Schnorr signature
    // The public key is the witness program (32 bytes)
    const publicKey = witnessProgram;

    // Verify using secp256k1 Schnorr signature verification
    const isValid = secp256k1.schnorr.verify(
      sigBytes,
      sigHash,
      publicKey
    );

    return isValid;
  } catch (error) {
    console.error('BIP-322 verification failed:', error);
    return false;
  }
}

/**
 * Simple format BIP-322 signature verification
 * This is a simplified version that doesn't create full virtual transactions
 */
export async function verifySimpleBIP322(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  try {
    // Validate address format
    if (!address.startsWith('bc1p') && !address.startsWith('tb1p')) {
      return false;
    }

    // Decode address to get the public key
    const network = address.startsWith('bc1') ? btc.NETWORK : btc.TEST_NETWORK;
    const decoded = btc.Address(network).decode(address);

    if (!decoded || decoded.type !== 'tr') {
      return false;
    }

    // Parse signature
    let sigBytes: Uint8Array;
    if (signature.startsWith('tr:')) {
      const sigHex = signature.slice(3);
      if (sigHex.length !== 128) {
        return false;
      }
      sigBytes = hex.decode(sigHex);
    } else {
      return false;
    }

    // Create BIP-322 message hash
    const messageHash = bip322MessageHash(message);

    // For simple verification, we check if the signature is valid
    // against the message hash using the public key from the address
    const publicKey = decoded.pubkey;

    // Verify Schnorr signature
    const isValid = secp256k1.schnorr.verify(
      sigBytes,
      messageHash,
      publicKey
    );

    return isValid;
  } catch (error) {
    console.error('Simple BIP-322 verification failed:', error);
    return false;
  }
}

/**
 * Format a signature for BIP-322 Taproot addresses
 * Converts a raw Schnorr signature to the "tr:" prefixed format
 */
export function formatTaprootSignature(signature: Uint8Array): string {
  if (signature.length !== 64) {
    throw new Error('Invalid Schnorr signature length');
  }
  return 'tr:' + hex.encode(signature);
}

/**
 * Parse a BIP-322 signature
 */
export async function parseBIP322Signature(signature: string): Promise<{
  type: 'taproot' | 'legacy' | 'segwit' | 'unknown';
  data: Uint8Array;
} | null> {
  try {
    if (signature.startsWith('tr:')) {
      // Taproot signature
      const sigHex = signature.slice(3);
      if (sigHex.length !== 128) {
        return null;
      }
      return {
        type: 'taproot',
        data: hex.decode(sigHex),
      };
    }

    // Could be base64 encoded legacy/segwit signature
    // Try to decode as base64
    try {
      const { base64 } = await import('@scure/base');
      const decoded = base64.decode(signature);

      if (decoded.length === 65) {
        // Classic signature with recovery flag
        const flag = decoded[0];
        if (flag >= 27 && flag <= 34) {
          return { type: 'legacy', data: decoded };
        } else if (flag >= 35 && flag <= 42) {
          return { type: 'segwit', data: decoded };
        }
      }
    } catch {
      // Not base64
    }

    return { type: 'unknown', data: new Uint8Array() };
  } catch {
    return null;
  }
}

/**
 * Check if an address supports BIP-322
 */
export function supportsBIP322(address: string): boolean {
  // Taproot addresses always support BIP-322
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
    return true;
  }

  // P2WPKH (native segwit) can support BIP-322
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
    return true;
  }

  // P2SH could support it if it's P2SH-P2WPKH
  if (address.startsWith('3') || address.startsWith('2')) {
    return true;
  }

  // Legacy P2PKH uses traditional signing but can be wrapped in BIP-322 format
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
    return true;
  }

  return false;
}