/**
 * Web Worker for PBKDF2 Key Derivation
 *
 * Moves expensive key derivation off the main thread to keep UI responsive.
 * This is a pure performance optimization - cryptographically identical to
 * running PBKDF2 on the main thread.
 */

interface DeriveKeyMessage {
  password: string;
  salt: string; // base64
  iterations: number;
}

const encoder = new TextEncoder();

async function deriveKeyInWorker(
  password: string,
  saltBase64: string,
  iterations: number
): Promise<ArrayBuffer> {
  // Decode salt from base64
  const saltBytes = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));

  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable - needed for session storage
    ['encrypt', 'decrypt']
  );

  // Export raw key bytes
  return crypto.subtle.exportKey('raw', derivedKey);
}

// Worker message handler
self.addEventListener('message', async (e: MessageEvent<DeriveKeyMessage>) => {
  try {
    const { password, salt, iterations } = e.data;
    const keyBytes = await deriveKeyInWorker(password, salt, iterations);

    // Convert to base64 for transfer
    const keyArray = new Uint8Array(keyBytes);
    const keyBase64 = btoa(String.fromCharCode(...keyArray));

    self.postMessage({ success: true, keyBase64 });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Key derivation failed',
    });
  }
});
