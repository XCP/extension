/** Provider hook for atomic marketplace multi-PSBT approval phases. */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  classifySignedInputAlkanes,
  fetchInputsAlkanes,
} from '@/core/alkanes/inputAssets';
import { extractPsbtDetails, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import {
  type DecodedPsbtInfo,
  decodePsbtForApproval,
} from '@/core/bitcoin/psbtApprovalDecoder';
import {
  analyzeMarketplaceBatch,
  parseMarketplaceBatchIntents,
} from '@/core/counterparty/marketplaceBatch';
import {
  analyzeAcceptanceCpfpBundle,
  type BumpAcceptanceFeeIntentClaim,
} from '@/core/counterparty/marketplaceBundle';
import type {
  AcceptExactOfferIntentClaim,
  MarketplaceApprovalReview,
} from '@/core/counterparty/marketplaceIntent';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { getActiveSettings } from '@/core/settings';
import { emitToBackground } from '@/platform/provider/emitToBackground';
import {
  getSignFlow,
  recordSignOutcome,
  type SignPsbtsRequest,
} from '@/platform/provider/signFlow';

export interface DecodedPsbtBundleItem {
  psbtDetails: ReturnType<typeof extractPsbtDetails>;
  txid?: string;
  marketplaceReview?: MarketplaceApprovalReview;
}

export interface DecodedPsbtBundleInfo {
  items: DecodedPsbtBundleItem[];
  review: MarketplaceApprovalReview;
}

const missingReview = (family: MarketplaceApprovalReview['family'], message: string) => ({
  status: 'blocked' as const,
  family,
  title: 'Marketplace transaction did not verify',
  facts: [],
  notices: [],
  blockers: [message],
});

function applyWalletSafetyBlock(
  review: MarketplaceApprovalReview,
  blocked: boolean,
): MarketplaceApprovalReview {
  if (!blocked) return review;
  return {
    ...review,
    status: 'blocked',
    notices: [],
    blockers: [
      ...review.blockers,
      'wallet safety checks rejected at least one requested signature',
    ],
  };
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
        if (!stored || stored.kind !== 'sign-psbts' || stored.items.length < 1) {
          throw new Error('PSBT bundle signing request not found or expired');
        }

        if (stored.bundleKind === 'acceptance-cpfp') {
          if (stored.items.length !== 2) {
            throw new Error('Exact acceptance fee-bump bundle must contain two transactions');
          }
          const [parentItem, childItem] = stored.items;
          if (parentItem!.marketplaceIntent.action !== 'accept_exact_offer') {
            throw new Error('Bundle parent is not an exact-offer acceptance');
          }
          if (childItem!.marketplaceIntent.action !== 'bump_acceptance_fee') {
            throw new Error('Bundle child is not an acceptance fee bump');
          }
          const parentIntent = parentItem!.marketplaceIntent as AcceptExactOfferIntentClaim;
          const childIntent = childItem!.marketplaceIntent as BumpAcceptanceFeeIntentClaim;
          const parent = await decodePsbtForApproval(
            parentItem!.psbtHex,
            Object.keys(parentItem!.signInputs),
            Object.values(parentItem!.signInputs).flat(),
            parentItem!.sighashTypes,
            undefined,
            'counterparty',
            undefined,
            parentIntent,
          );
          const child = extractPsbtDetails(childItem!.psbtHex);
          const firstChildInputTxid = child.inputs[0]?.txid;
          const childPayload = firstChildInputTxid
            ? extractPayloadFromOutputs(
                child.outputs.map(output => output.script ?? ''),
                firstChildInputTxid,
              )
            : null;
          const childIndices = Object.values(childItem!.signInputs).flat();
          const settings = getActiveSettings();
          const childAlkanes = (settings.protectAlkanesUtxos || settings.enableDieselMinting)
            ? await fetchInputsAlkanes(child.inputs, childIndices)
            : [];
          const childAlkanesSafety = classifySignedInputAlkanes(childAlkanes, childIndices);
          const review = applyWalletSafetyBlock(analyzeAcceptanceCpfpBundle({
            parentIntent,
            parentReview: parent.marketplaceReview ?? missingReview(
              'accept_exact_offer',
              'the parent exact-offer semantic proof is missing',
            ),
            childIntent,
            childInputs: child.inputs,
            childOutputs: child.outputs,
            childSignedInputs: childIndices.map(index => ({
              index,
              sighashType: resolvePsbtSighashType(
                childItem!.sighashTypes[index],
                child.inputs[index]?.sighashType,
              ),
            })),
            childSignerAddresses: Object.keys(childItem!.signInputs),
            childTransactionId: child.transactionId,
            childHasCounterpartyPayload: childPayload !== null,
          }), parent.safety.blocked
            || childAlkanesSafety.withBalances.length > 0
            || childAlkanesSafety.unknownStatus.length > 0);
          setRequest(stored);
          setDecodedInfo({
            items: [parent, { psbtDetails: child, txid: child.transactionId }],
            review,
          });
          return;
        }

        const parsed = parseMarketplaceBatchIntents(
          stored.items.map(item => item.marketplaceIntent),
        );
        if (parsed.kind !== stored.bundleKind) {
          throw new Error('Stored marketplace batch kind differs from its intents');
        }
        const decoded: DecodedPsbtInfo[] = await Promise.all(stored.items.map((item, index) =>
          decodePsbtForApproval(
            item.psbtHex,
            Object.keys(item.signInputs),
            Object.values(item.signInputs).flat(),
            item.sighashTypes,
            undefined,
            'counterparty',
            undefined,
            parsed.intents[index],
          )));
        const itemReviews = decoded.map((item, index) =>
          item.marketplaceReview ?? missingReview(
            parsed.intents[index]!.action,
            `marketplace semantic proof ${index + 1} is missing`,
          ));
        const review = applyWalletSafetyBlock(
          analyzeMarketplaceBatch(parsed.kind, parsed.intents, itemReviews),
          decoded.some((item) => item.safety.blocked),
        );
        setRequest(stored);
        setDecodedInfo({ items: decoded, review });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load PSBT bundle');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [requestId]);

  const handleSuccess = useCallback(async (signedPsbtHexes: string[]) => {
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
