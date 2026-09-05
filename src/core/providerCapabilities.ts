import { AddressFormat } from '@/core/bitcoin/address';
import type { Wallet } from '@/types/wallet';

export interface ProviderPsbtSigningMethodCapabilities {
  supported: boolean;
  /** Exact explicit sighash bytes this provider method accepts. */
  sighashTypes: number[];
  /** Whether the request may select a subset or must select every input. */
  inputScope: 'selected' | 'all';
  /** What may occupy inputs which this wallet is not being asked to sign. */
  externalInputs?: 'any' | 'presigned';
}

export interface ProviderPsbtSigningCapabilities {
  psbt: ProviderPsbtSigningMethodCapabilities;
  psbtBatch: ProviderPsbtSigningMethodCapabilities & {
    /** Maximum number of requests accepted by one xcp_signPsbts approval. */
    maxRequests: number;
  };
}

export interface ProviderPsbtSigningRequestShape {
  inputCount: number;
  requestedInputIndices?: number[];
  sighashTypes: number[];
  /** Inputs carrying signature material before this wallet is asked to sign. */
  presignedInputIndices?: number[];
}

/**
 * Enforce one advertised method contract before an approval or hardware prompt opens.
 * The ordinary provider validators still prove ownership, intent, and PSBT semantics.
 */
export function assertProviderPsbtSigningRequest(
  method: ProviderPsbtSigningMethodCapabilities,
  request: ProviderPsbtSigningRequestShape,
): void {
  if (!method.supported) {
    throw new Error('The active wallet cannot sign PSBTs through the provider');
  }
  if (!Number.isSafeInteger(request.inputCount) || request.inputCount < 1) {
    throw new Error('PSBT signing capability check requires at least one input');
  }
  if (request.requestedInputIndices === undefined) {
    if (method.inputScope === 'all' || method.externalInputs === 'presigned') {
      throw new Error('The active wallet requires PSBT inputs to be selected explicitly');
    }
    return;
  }

  const requested = request.requestedInputIndices;
  if (
    requested.length === 0
    || new Set(requested).size !== requested.length
    || requested.some(index => !Number.isSafeInteger(index) || index < 0 || index >= request.inputCount)
  ) {
    throw new Error(
      'PSBT signing request must select at least one input, with valid non-duplicate selections',
    );
  }
  const ordered = [...requested].sort((a, b) => a - b);
  if (
    method.inputScope === 'all'
    && (requested.length !== request.inputCount
      || ordered.some((inputIndex, index) => inputIndex !== index))
  ) {
    throw new Error('The active wallet requires every PSBT input to be selected');
  }
  if (method.externalInputs === 'presigned') {
    const presigned = new Set(request.presignedInputIndices ?? []);
    for (let inputIndex = 0; inputIndex < request.inputCount; inputIndex++) {
      if (requested.includes(inputIndex)) continue;
      if (!presigned.has(inputIndex)) {
        throw new Error(
          `The active wallet requires external input ${inputIndex} to be pre-signed`,
        );
      }
      const sighashType = request.sighashTypes[inputIndex];
      if (sighashType === undefined || !method.sighashTypes.includes(sighashType)) {
        throw new Error(
          `The active wallet cannot verify external input ${inputIndex} with sighash 0x${(sighashType ?? 0).toString(16)}`,
        );
      }
    }
  }
  for (const inputIndex of requested) {
    const sighashType = request.sighashTypes[inputIndex];
    if (sighashType === undefined || !method.sighashTypes.includes(sighashType)) {
      throw new Error(
        `The active wallet cannot sign input ${inputIndex} with sighash 0x${(sighashType ?? 0).toString(16)}`,
      );
    }
  }
}

/**
 * Report the capability of the current wallet, not its implementation type.
 * Sites can reject an unsupported operation before opening an approval or hardware prompt.
 */
export function providerPsbtSigningCapabilities(
  wallet: Pick<Wallet, 'type' | 'addressFormat'>,
): ProviderPsbtSigningCapabilities {
  if (wallet.type !== 'hardware') {
    return {
      psbt: {
        supported: true,
        sighashTypes: wallet.addressFormat === AddressFormat.P2TR ? [0x00, 0x01, 0x81, 0x83] : [0x01, 0x81, 0x83],
        inputScope: 'selected',
        externalInputs: 'any',
      },
      psbtBatch: {
        supported: true,
        sighashTypes: [0x01, 0x83],
        inputScope: 'selected',
        externalInputs: 'any',
        maxRequests: 8,
      },
    };
  }

  const supported = wallet.addressFormat === AddressFormat.P2WPKH;
  return {
    psbt: {
      supported,
      sighashTypes: supported ? [0x01] : [],
      inputScope: 'selected',
      externalInputs: 'presigned',
    },
    psbtBatch: {
      supported,
      sighashTypes: supported ? [0x01] : [],
      inputScope: 'selected',
      externalInputs: 'presigned',
      maxRequests: supported ? 8 : 0,
    },
  };
}
