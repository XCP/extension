/** Shared PSBT decoding and safety analysis used by single and atomic provider approvals. */

import { resolvePsbtCounterpartyPayload } from '@/core/bitcoin/envelopeLeafGuard';
import type { BitcoinPaymentIntentV1 } from '@/core/bitcoin/providerPayment';
import {
  extractPsbtDetails,
  type PsbtDetails,
  resolvePsbtSighashType,
  spendsTaprootOutput,
} from '@/core/bitcoin/psbt';
import { noTrustedPrevout, type TrustedPrevoutResolver } from '@/core/bitcoin/trustedPrevout';
import { fetchInputsAttachedAssets, type InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { MarketplaceIntentClaimV1, PolicyOfferWalletContext } from '@/core/counterparty/marketplace/intentTypes';
import { type LinkedInputEvidence, withLinkedInputAssets } from '@/core/counterparty/marketplaceAttachLink';
import { liveAttachmentEvidenceSource, withPackageParents } from '@/core/counterparty/pendingAttachments';
import type { InscriptionCommitContext } from '@/core/counterparty/providerInscriptions';
import {
  analyzeSignRequest,
  type SignRequestAnalysis,
} from '@/core/counterparty/signRequestAnalysis';
import type { ZeldPackageParent } from '@/core/zeld/signRequestZeld';

export interface DecodedPsbtInfo extends SignRequestAnalysis {
  psbtDetails: PsbtDetails;
  /** Unsigned transaction ID computed locally from the PSBT. */
  txid?: string;
}

export async function decodePsbtForApproval(
  psbtHex: string,
  signerAddresses?: string[],
  signedInputIndices?: number[],
  requestedSighashTypes?: number[],
  inscriptionContext?: InscriptionCommitContext,
  signingPurpose: 'counterparty' | 'bitcoin-payment' = 'counterparty',
  bitcoinPaymentIntent?: BitcoinPaymentIntentV1,
  marketplaceIntent?: MarketplaceIntentClaimV1,
  ownedAddresses?: string[],
  options: {
    /**
     * Evidence for one input proved by another item of the same atomic bundle, used where the
     * ledger cannot yet know that input (see marketplaceAttachLink.ts). Only the bundle decoder
     * supplies it, and only after proving the input is exactly the linked output.
     */
    linkedInput?: LinkedInputEvidence;
    /**
     * Unsigned bytes, keyed by txid, of transactions in the same atomic bundle that this PSBT
     * spends before they are broadcast. Asset lookups of their outputs derive from these bytes
     * (pendingAttachments.ts withPackageParents). Only the bundle decoder supplies them, and only
     * from an item it has already proved.
     */
    packageParents?: ReadonlyMap<string, string>;
    /**
     * The same parents as the ZELD analysis reads them (inputs with owners, signed inputs,
     * outputs), so what their inputs carry is placed on the outputs this PSBT spends.
     */
    zeldPackageParents?: ReadonlyMap<string, ZeldPackageParent>;
    /** Resolves prevouts the wallet itself broadcast (its trusted journal). */
    resolveTrustedPrevout?: TrustedPrevoutResolver;
    /**
     * A ledger lookup already made for exactly these input outpoints, in this order. The bundle
     * decoder shares one lookup across policy-offer alternatives, which the batch proof requires
     * to spend the identical inputs; any other input list is looked up afresh.
     */
    sharedAttachedAssets?: { outpoints: string[]; assets: InputAttachedAssets[] };
    /** Wallet-supplied policy-offer facts; see PolicyOfferWalletContext. */
    policyOffer?: PolicyOfferWalletContext;
    /** The site's signed reveal for a Counterparty Taproot commit; proved in analyzeSignRequest. */
    counterpartyReveal?: string;
  } = {},
): Promise<DecodedPsbtInfo> {
  const psbtDetails = extractPsbtDetails(psbtHex);
  const { linkedInput, packageParents, resolveTrustedPrevout = noTrustedPrevout, sharedAttachedAssets } = options;
  const outpoints = psbtDetails.inputs.map(input => `${input.txid}:${input.vout}`);
  const reusable = sharedAttachedAssets !== undefined
    && sharedAttachedAssets.outpoints.length === outpoints.length
    && sharedAttachedAssets.outpoints.every((outpoint, index) => outpoint === outpoints[index]);
  const ledgerAssets = reusable
    ? Promise.resolve(sharedAttachedAssets.assets)
    : fetchInputsAttachedAssets(psbtDetails.inputs, signedInputIndices, resolveTrustedPrevout,
      packageParents ? withPackageParents(liveAttachmentEvidenceSource, packageParents) : undefined);
  const attachedAssetsPromise = linkedInput
    ? ledgerAssets.then(ledger => withLinkedInputAssets(ledger, linkedInput.entry, linkedInput.attachTxid))
    : ledgerAssets;
  const txid = psbtDetails.transactionId;
  // The outputs' payload, or else input 0's reveal envelope: the same reading decides which leaf
  // the signer may sign (envelopeLeafGuard.ts), so the message shown is the message signed.
  const counterpartyDataHex = resolvePsbtCounterpartyPayload(psbtDetails)?.dataHex;

  // Addresses used by policy must be proved by the output script. Even filling an unresolved
  // address from an indexer can relabel a spendable P2PK output as our change and bypass the
  // external-payment proof. Unknown scripts remain unknown; no remote decode is needed.

  const analysis = await analyzeSignRequest({
    counterpartyDataHex,
    inputs: psbtDetails.inputs,
    outputs: psbtDetails.outputs,
    signerAddresses: signerAddresses ?? [],
    signedInputIndices: signedInputIndices ?? [],
    signedInputs: (signedInputIndices ?? []).map(index => ({
      index,
      sighashType: resolvePsbtSighashType(
        requestedSighashTypes?.[index],
        psbtDetails.inputs[index]?.sighashType,
        spendsTaprootOutput(psbtDetails.inputs[index]),
      ),
    })),
    transactionId: txid,
    attachedAssets: attachedAssetsPromise,
    inscriptionContext,
    counterpartyReveal: options.counterpartyReveal,
    signingPurpose,
    bitcoinPaymentIntent,
    marketplaceIntent,
    ownedAddresses,
    transactionVersion: psbtDetails.transactionVersion,
    lockTime: psbtDetails.lockTime,
    policyOffer: options.policyOffer,
    zeldPackageParents: options.zeldPackageParents,
  });

  return { psbtDetails, txid, ...analysis };
}
