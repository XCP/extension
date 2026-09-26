import { AddressFormat } from '@/core/bitcoin/address';
import { MAX_POLICY_ALTERNATIVES } from '@/core/counterparty/policyOffer';
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
    /** Maximum alternatives in one `fund-policy-offer` approval; 0 when that bundle is unsupported. */
    maxPolicyOfferAlternatives: number;
    /**
     * Linked marketplace bundle kinds this wallet can prove as a whole and then sign. A site
     * sends such a bundle only when its kind is listed: an older wallet proves each item alone,
     * which blocks a listing whose input is its sibling attach's not-yet-broadcast output.
     */
    marketplaceBundles: MarketplaceBundleCapability[];
  };
}

/**
 * `attach-and-list`: [attach_for_listing, create_listing], the listing proved from the attach.
 * `authorize-offers`: 1..8 authorize_exact_offer items sharing one bidder funding outpoint.
 * `fund-policy-offer`: 1..100 fund_policy_offer alternatives sharing one funding set; the one
 * kind allowed more than `maxRequests`, bounded by `maxPolicyOfferAlternatives`.
 */
export type MarketplaceBundleCapability = 'attach-and-list' | 'authorize-offers' | 'fund-policy-offer';

/** All need a software signer: the listing signs SINGLE|ANYONECANPAY over an unsigned buyer
 * placeholder, an exact offer leaves the seller's input unsigned for the seller, and a policy-offer
 * parent leaves the market anchor unsigned. */
const SOFTWARE_MARKETPLACE_BUNDLES: MarketplaceBundleCapability[] = [
  'attach-and-list', 'authorize-offers', 'fund-policy-offer',
];

export interface ProviderPsbtSigningRequestShape {
  inputCount: number;
  requestedInputIndices?: number[];
  sighashTypes: number[];
  /** Inputs carrying signature material before this wallet is asked to sign. */
  presignedInputIndices?: number[];
}

/**
 * Name, in words a site can show its user, a marketplace action this signing method can never
 * complete, before the generic input checks would refuse it with a lower-level reason.
 *
 * Exact-offer acceptance is served unsigned: the market keeps the buyer's input 0 signature and
 * merges it only after the seller signs input 1. A method that requires every other input to be
 * pre-signed (the hardware contract) therefore cannot accept exact offers, as it cannot accept
 * collection offers either.
 */
export function unsupportedMarketplaceActionReason(
  method: ProviderPsbtSigningMethodCapabilities,
  action: string | undefined,
): string | null {
  if (action === 'accept_exact_offer' && method.externalInputs === 'presigned') {
    return 'The active wallet cannot accept offers: the market adds the buyer\'s signature only '
      + 'after the seller signs, and this wallet signs only when every other input is already '
      + 'signed. Accept this offer from a software wallet instead.';
  }
  return null;
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
        // A P2TR signer's policy-offer funding inputs sign DEFAULT, as its single-PSBT method does.
        sighashTypes: wallet.addressFormat === AddressFormat.P2TR ? [0x00, 0x01, 0x83] : [0x01, 0x83],
        inputScope: 'selected',
        externalInputs: 'any',
        maxRequests: 8,
        maxPolicyOfferAlternatives: MAX_POLICY_ALTERNATIVES,
        marketplaceBundles: [...SOFTWARE_MARKETPLACE_BUNDLES],
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
      maxPolicyOfferAlternatives: 0,
      // Every hardware wallet's batch contract requires external inputs to be pre-signed and
      // accepts only SIGHASH_ALL, which neither linked bundle can satisfy.
      marketplaceBundles: [],
    },
  };
}
