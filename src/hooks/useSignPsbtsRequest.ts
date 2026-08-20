/** Provider hook for the atomic exact-acceptance plus CPFP approval flow. */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { extractPsbtDetails, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import {
  type DecodedPsbtInfo,
  decodePsbtForApproval,
} from '@/core/bitcoin/psbtApprovalDecoder';
import {
  analyzeAcceptanceCpfpBundle,
  type BumpAcceptanceFeeIntentClaim,
} from '@/core/counterparty/marketplaceBundle';
import type {
  AcceptExactOfferIntentClaim,
  MarketplaceApprovalReview,
} from '@/core/counterparty/marketplaceIntent';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { emitToBackground } from '@/platform/provider/emitToBackground';
import {
  getSignFlow,
  recordSignOutcome,
  type SignPsbtsRequest,
} from '@/platform/provider/signFlow';

export interface DecodedPsbtBundleInfo {
  parent: DecodedPsbtInfo;
  child: ReturnType<typeof extractPsbtDetails>;
  review: MarketplaceApprovalReview;
}

export function useSignPsbtsRequest() {
  const [searchParams] = useSearchParams();
  const [request, setRequest] = useState<SignPsbtsRequest | null>(null);
  const [decodedInfo, setDecodedInfo] = useState<DecodedPsbtBundleInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = searchParams.get('requestId');

  useEffect(() => {
    if (!requestId) {
      setError('No PSBT bundle request ID provided');
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const stored = await getSignFlow(requestId) as SignPsbtsRequest | null;
        if (!stored || stored.kind !== 'sign-psbts') {
          throw new Error('PSBT bundle signing request not found or expired');
        }
        const [parentItem, childItem] = stored.items;
        if (parentItem.marketplaceIntent.action !== 'accept_exact_offer') {
          throw new Error('Bundle parent is not an exact-offer acceptance');
        }
        if (childItem.marketplaceIntent.action !== 'bump_acceptance_fee') {
          throw new Error('Bundle child is not an acceptance fee bump');
        }
        const parentIntent = parentItem.marketplaceIntent as AcceptExactOfferIntentClaim;
        const childIntent = childItem.marketplaceIntent as BumpAcceptanceFeeIntentClaim;
        const parent = await decodePsbtForApproval(
          parentItem.psbtHex,
          Object.keys(parentItem.signInputs),
          Object.values(parentItem.signInputs).flat(),
          parentItem.sighashTypes,
          undefined,
          'counterparty',
          undefined,
          parentIntent,
        );
        const child = extractPsbtDetails(childItem.psbtHex);
        const firstChildInputTxid = child.inputs[0]?.txid;
        const childPayload = firstChildInputTxid
          ? extractPayloadFromOutputs(
              child.outputs.map(output => output.script ?? ''),
              firstChildInputTxid,
            )
          : null;
        const childIndices = Object.values(childItem.signInputs).flat();
        const review = analyzeAcceptanceCpfpBundle({
          parentIntent,
          parentReview: parent.marketplaceReview ?? {
            status: 'blocked',
            family: 'accept_exact_offer',
            title: 'Exact offer parent did not verify',
            facts: [],
            notices: [],
            blockers: ['the parent exact-offer semantic proof is missing'],
          },
          childIntent,
          childInputs: child.inputs,
          childOutputs: child.outputs,
          childSignedInputs: childIndices.map(index => ({
            index,
            sighashType: resolvePsbtSighashType(
              childItem.sighashTypes[index],
              child.inputs[index]?.sighashType,
            ),
          })),
          childSignerAddresses: Object.keys(childItem.signInputs),
          childTransactionId: child.transactionId,
          childHasCounterpartyPayload: childPayload !== null,
        });
        setRequest(stored);
        setDecodedInfo({ parent, child, review });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load PSBT bundle');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [requestId]);

  const handleSuccess = useCallback(async (signedPsbtHexes: [string, string]) => {
    if (!requestId) return;
    await recordSignOutcome(requestId, 'completed', { signedPsbtHexes });
    emitToBackground(`sign-psbts-complete-${requestId}`, { signedPsbtHexes });
  }, [requestId]);

  const handleCancel = useCallback(async () => {
    if (!requestId) return;
    await recordSignOutcome(requestId, 'cancelled');
    emitToBackground(`sign-psbts-cancel-${requestId}`, { reason: 'User cancelled' });
  }, [requestId]);

  return { request, decodedInfo, isLoading, error, handleSuccess, handleCancel };
}
