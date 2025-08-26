/**
 * Request Signing for Provider Security
 * 
 * Similar to MetaMask's approach, this provides cryptographic proof that requests
 * originated from the legitimate extension and haven't been tampered with.
 */

import { sha256 } from '@noble/hashes/sha2';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';

interface SignedRequest {
  origin: string;
  method: string;
  params: any[];
  timestamp: number;
  nonce: string;
  signature: string;
  publicKey: string;
}

class RequestSigner {
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;
  
  constructor() {
    // Don't initialize keys in constructor to avoid race conditions
    // Keys will be initialized lazily when first needed
  }
  
  /**
   * Initialize signing keys for this extension instance
   */
  private async initializeKeys() {
    try {
      // Try to load existing keys from storage
      const stored = await browser.storage.local.get('signingKeys');
      
      if (stored.signingKeys?.privateKey && stored.signingKeys?.publicKey) {
        this.privateKey = hex.decode(stored.signingKeys.privateKey);
        this.publicKey = hex.decode(stored.signingKeys.publicKey);
      } else {
        // Generate new keys for this extension instance
        this.privateKey = secp256k1.utils.randomSecretKey();
        this.publicKey = secp256k1.getPublicKey(this.privateKey);
        
        // Store keys (in a real implementation, these might be derived from user's wallet)
        await browser.storage.local.set({
          signingKeys: {
            privateKey: hex.encode(this.privateKey),
            publicKey: hex.encode(this.publicKey)
          }
        });
      }
    } catch (error) {
      console.error('Failed to initialize signing keys:', error);
      // Generate ephemeral keys for this session
      this.privateKey = secp256k1.utils.randomSecretKey();
      this.publicKey = secp256k1.getPublicKey(this.privateKey);
    }
  }
  
  /**
   * Sign a provider request to prove it came from the extension
   */
  async signRequest(
    origin: string,
    method: string,
    params: any[] = []
  ): Promise<SignedRequest> {
    if (!this.privateKey || !this.publicKey) {
      await this.initializeKeys();
    }
    
    const timestamp = Date.now();
    const nonce = this.generateNonce();
    
    // Create message to sign
    const message = this.createSigningMessage(origin, method, params, timestamp, nonce);
    const messageHash = sha256(message);
    
    // Sign the message hash (v2 requires prehash option for hashed messages)
    const signature = secp256k1.sign(messageHash, this.privateKey!, { prehash: true });
    
    return {
      origin,
      method,
      params,
      timestamp,
      nonce,
      signature: hex.encode(signature),
      publicKey: hex.encode(this.publicKey!)
    };
  }
  
  /**
   * Verify a signed request
   */
  verifyRequest(signedRequest: SignedRequest): boolean {
    try {
      const { origin, method, params, timestamp, nonce, signature, publicKey } = signedRequest;
      
      // Check timestamp (reject requests older than 5 minutes)
      if (Date.now() - timestamp > 5 * 60 * 1000) {
        return false;
      }
      
      // Recreate the signing message
      const message = this.createSigningMessage(origin, method, params, timestamp, nonce);
      const messageHash = sha256(message);
      
      // Verify signature with error handling
      try {
        const signatureBytes = hex.decode(signature);
        const publicKeyBytes = hex.decode(publicKey);
        
        return secp256k1.verify(signatureBytes, messageHash, publicKeyBytes, { prehash: true });
      } catch (hexError) {
        console.warn('Invalid signature or public key format:', hexError);
        return false;
      }
    } catch (error) {
      console.error('Request verification failed:', error);
      return false;
    }
  }
  
  /**
   * Get the extension's public key for verification
   */
  getPublicKey(): string | null {
    return this.publicKey ? hex.encode(this.publicKey) : null;
  }
  
  /**
   * Create message to be signed
   */
  private createSigningMessage(
    origin: string,
    method: string,
    params: any[],
    timestamp: number,
    nonce: string
  ): Uint8Array {
    const message = JSON.stringify({
      origin,
      method,
      params: JSON.stringify(params), // Double stringify for consistency
      timestamp,
      nonce,
      version: '1.0'
    });
    
    return new TextEncoder().encode(message);
  }
  
  private generateNonce(): string {
    const array = new Uint8Array(16);
    try {
      crypto.getRandomValues(array);
      // Check if the array is all zeros (indicating a bad mock)
      const isAllZeros = array.every(byte => byte === 0);
      if (isAllZeros) {
        // Fallback when mock returns all zeros
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 0xffffffff);
        const counter = Math.floor(Math.random() * 0xffff);
        for (let i = 0; i < 8; i++) {
          array[i] = (timestamp >> (i * 8)) & 0xff;
        }
        for (let i = 0; i < 4; i++) {
          array[i + 8] = (random >> (i * 8)) & 0xff;
        }
        for (let i = 0; i < 4; i++) {
          array[i + 12] = (counter >> (i * 8)) & 0xff;
        }
      }
    } catch {
      // Fallback for environments without crypto
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 0xffffffff);
      const counter = Math.floor(Math.random() * 0xffff);
      for (let i = 0; i < 8; i++) {
        array[i] = (timestamp >> (i * 8)) & 0xff;
      }
      for (let i = 0; i < 4; i++) {
        array[i + 8] = (random >> (i * 8)) & 0xff;
      }
      for (let i = 0; i < 4; i++) {
        array[i + 12] = (counter >> (i * 8)) & 0xff;
      }
    }
    return hex.encode(array);
  }
}

// Export singleton instance
export const requestSigner = new RequestSigner();

/**
 * Middleware to add request signing to provider methods
 */
export async function withRequestSigning<T>(
  origin: string,
  method: string,
  params: any[],
  handler: (signedRequest: SignedRequest) => Promise<T>
): Promise<T> {
  const signedRequest = await requestSigner.signRequest(origin, method, params);
  
  // Verify our own signature (sanity check)
  if (!requestSigner.verifyRequest(signedRequest)) {
    throw new Error('Request signing failed');
  }
  
  return handler(signedRequest);
}

/**
 * Validate that a request came from the legitimate extension
 * This would be used by the content script to verify background messages
 */
export function validateRequestOrigin(
  message: any,
  expectedPublicKey: string
): boolean {
  if (!message.signature || !message.publicKey) {
    return false;
  }
  
  // Verify it's from the expected extension instance
  if (message.publicKey !== expectedPublicKey) {
    return false;
  }
  
  // Verify the signature
  return requestSigner.verifyRequest(message);
}

/**
 * Generate a challenge for authentication
 * This can be used by dApps to verify they're talking to the real extension
 */
export async function generateAuthChallenge(): Promise<{
  challenge: string;
  signature: string;
  publicKey: string;
}> {
  const challengeBytes = new Uint8Array(32);
  crypto.getRandomValues(challengeBytes);
  const challenge = hex.encode(challengeBytes);
  const signedRequest = await requestSigner.signRequest('auth', 'challenge', [challenge]);
  
  return {
    challenge,
    signature: signedRequest.signature,
    publicKey: signedRequest.publicKey
  };
}

/**
 * For debugging - get request signing stats
 */
export function getSigningStats() {
  let version = '0.0.0';
  try {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getManifest) {
      version = browser.runtime.getManifest().version;
    }
  } catch (error) {
    // In test environments or when browser API is not available
  }
  
  return {
    hasKeys: !!requestSigner.getPublicKey(),
    publicKey: requestSigner.getPublicKey(),
    extensionVersion: version
  };
}