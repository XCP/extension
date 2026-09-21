/** Shared PSBT decoding and safety analysis used by single and atomic provider approvals. */

import type { BitcoinPaymentIntentV1 } from '@/core/bitcoin/providerPayment';
import {
  extractPsbtDetails,
  type PsbtDetails,
  resolvePsbtSighashType,
} from '@/core/bitcoin/psbt';
import { fetchInputsAttachedAssets } from '@/core/counterparty/inputAssets';
import type { MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplaceIntent';
import {
  type InscriptionCommitContext,
  resolveRevealMessage,
} from '@/core/counterparty/providerInscriptions';
import {
  analyzeSignRequest,
  type SignRequestAnalysis,
} from '@/core/counterparty/signRequestAnalysis';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';

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
): Promise<DecodedPsbtInfo> {
  const psbtDetails = extractPsbtDetails(psbtHex);
  const attachedAssetsPromise = fetchInputsAttachedAssets(psbtDetails.inputs, signedInputIndices);
  const txid = psbtDetails.transactionId;
  let counterpartyDataHex: string | undefined;

  const firstInputTxid = psbtDetails.inputs[0]?.txid;
  if (firstInputTxid) {
    counterpartyDataHex = extractPayloadFromOutputs(
      psbtDetails.outputs.map(output => output.script ?? ''),
      firstInputTxid,
    ) ?? undefined;
  }
  if (!counterpartyDataHex) {
    const reveal = resolveRevealMessage(psbtDetails.inputs, psbtDetails.outputs);
    if (reveal) counterpartyDataHex = reveal.messageHex;
  }

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
      ),
    })),
    transactionId: txid,
    attachedAssets: attachedAssetsPromise,
    inscriptionContext,
    signingPurpose,
    bitcoinPaymentIntent,
    marketplaceIntent,
  });

  return { psbtDetails, txid, ...analysis };
}
