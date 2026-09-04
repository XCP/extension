/** Shared PSBT decoding and safety analysis used by single and atomic provider approvals. */

import { fetchInputsAlkanes } from '@/core/alkanes/inputAssets';
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
import { decodeRawTransaction } from '@/core/counterparty/transaction';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { getActiveSettings } from '@/core/settings';

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
  const settings = getActiveSettings();
  const alkaneBalancesPromise = (settings.protectAlkanesUtxos || settings.enableDieselMinting)
    ? fetchInputsAlkanes(psbtDetails.inputs, signedInputIndices)
    : Promise.resolve([]);
  let txid: string | undefined = psbtDetails.transactionId;
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

  if (psbtDetails.rawTxHex) {
    try {
      const decoded = await decodeRawTransaction(psbtDetails.rawTxHex, true);
      txid ??= decoded.txid;
      for (const vout of decoded.vout) {
        const output = psbtDetails.outputs.find(candidate => candidate.index === vout.n);
        // Remote decoding may fill an address the local decoder could not establish, never replace
        // a local address used by the money-movement and safety classifiers (ADR-019).
        if (output && !output.address && vout.scriptPubKey.address) {
          output.address = vout.scriptPubKey.address;
        }
      }
    } catch (error) {
      console.warn('Failed to decode transaction via API:', error);
    }
  }

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
    alkaneBalances: alkaneBalancesPromise,
    inscriptionContext,
    signingPurpose,
    bitcoinPaymentIntent,
    marketplaceIntent,
  });

  return { psbtDetails, txid, ...analysis };
}
