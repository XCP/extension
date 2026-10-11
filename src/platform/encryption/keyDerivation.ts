import { base64ToBuffer, bufferToBase64 } from '@/core/encryption/buffer';
import { AES_KEY_BITS, DEFAULT_PBKDF2_ITERATIONS, deriveKey, validateKeyDerivation } from '@/core/encryption/encryption';

let kdfWorker: Worker | null = null;

function getKdfWorker(): Worker | null {
  if (kdfWorker) return kdfWorker;

  try {
    kdfWorker = new Worker(new URL('./kdf-worker.ts', import.meta.url), {
      type: 'module',
    });
    return kdfWorker;
  } catch {
    return null;
  }
}

interface WorkerResponse {
  success: boolean;
  keyBase64?: string;
  error?: string;
}

export async function deriveKeyAsync(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  validateKeyDerivation(password, salt, iterations);

  const worker = getKdfWorker();

  if (!worker) {
    return deriveKey(password, salt, iterations);
  }

  const saltBase64 = bufferToBase64(salt);

  async function importDerivedKey(encoded: string): Promise<CryptoKey> {
    // Session storage requires an extractable key. Always clear the intermediate bytes, including
    // when the import rejects, and keep that rejection attached to the requesting promise.
    const keyBytes = base64ToBuffer(encoded);
    try {
      return await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'AES-GCM', length: AES_KEY_BITS }, true, ['encrypt', 'decrypt']
      );
    } finally {
      keyBytes.fill(0);
    }
  }

  return new Promise((resolve, reject) => {
    const handleMessage = (e: MessageEvent<WorkerResponse>) => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
      kdfWorker = null;

      if (e.data.success && e.data.keyBase64) {
        importDerivedKey(e.data.keyBase64).then(
          resolve,
          () => reject(new Error('Failed to import derived key')),
        );
      } else {
        reject(new Error(e.data.error || 'Key derivation failed'));
      }
    };

    const handleError = (e: ErrorEvent) => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
      kdfWorker = null;
      reject(new Error(`Worker error: ${e.message}`));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    worker.postMessage({ password, salt: saltBase64, iterations });
  });
}
