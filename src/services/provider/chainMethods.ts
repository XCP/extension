/**
 * Chain methods that run without an approval: xcp_getBalances reads the active address's balances,
 * and xcp_broadcastTransaction relays a transaction the site already has signed.
 */

import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { fetchTokenBalance } from '@/core/counterparty/api';
import { generateRequestId } from '@/core/id';
import { checkReplayAttempt, markTransactionBroadcasted, markTransactionFailed, recordTransaction } from '@/core/replayPrevention';
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { analytics } from '@/platform/fathom';
import { rememberSuccessfulBroadcast } from '@/platform/provider/recentBroadcasts';
import { findSafeChangeSigningAddress } from '@/platform/provider/signFlow';
import { invalidParams, walletLocked } from '@/services/provider/requestErrors';
import type { ProviderMethodContext } from '@/services/provider/requestIntake';

/** xcp_getBalances: the active address's BTC and address-held XCP balances. */
export async function getBalances({ origin, walletService, connectionService }: ProviderMethodContext) {
  // Check if connected
  if (!await connectionService.hasPermission(origin)) {
    throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
  }
  
  const activeAddress = await walletService.getActiveAddress();
  if (!activeAddress) {
    throw walletLocked();
  }
  
  try {
    // Fetch BTC balance
    const btcBalance = await fetchBTCBalance(activeAddress.address);

    // Ask for XCP directly. Enumerating an address's balances is both
    // wasteful for collectors and wrong once XCP falls outside the
    // first page of assets.
    const xcpBalance = await fetchTokenBalance(activeAddress.address, 'XCP', {
      verbose: true,
      // UTXO-attached XCP is not spendable as the address's ordinary
      // balance and must not make a dApp think it can fund an action.
      type: 'address'
    });

    return {
      address: activeAddress.address,
      btc: {
        confirmed: btcBalance || 0,
        unconfirmed: 0,
        total: btcBalance || 0
      },
      xcp: xcpBalance.quantity_normalized ?? '0'
    };
  } catch (error) {
    console.error('[ProviderService] Error fetching balances:', error);
    // An unavailable API is not evidence that the wallet is empty.
    // Returning zeros made connected dApps reject valid transactions
    // as "insufficient balance" until a refresh happened to succeed.
    throw new Error('Unable to fetch wallet balances — please try again');
  }
}

/** xcp_broadcastTransaction: broadcast a signed transaction, guarded against replays. */
export async function broadcastTransaction(
  { origin, params, walletService, connectionService }: ProviderMethodContext,
) {
  // Check if connected
  if (!await connectionService.hasPermission(origin)) {
    throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
  }

  const signedTx = params?.[0];
  if (!signedTx) {
    throw invalidParams('Signed transaction is required');
  }
  if (typeof signedTx !== 'string') {
    throw invalidParams('Signed transaction must be a hex string');
  }

  // Broadcasting is intentionally open to any signed transaction, so broadcasting alone
  // cannot make its outputs trusted. Only an exact transaction this origin just had the
  // extension sign, after every input was resolved as attachment-free, may seed change.
  let safeChangeAddress: string | null = null;
  try {
    safeChangeAddress = await findSafeChangeSigningAddress(signedTx, origin);
  } catch (error) {
    console.warn('[ProviderService] Failed to verify broadcast signing flow:', error);
  }

  // Check for replay attempt before broadcasting
  const replayCheck = await checkReplayAttempt(
    origin,
    'xcp_broadcastTransaction',
    [signedTx]
  );

  if (replayCheck.isReplay) {
    throw new Error(`Transaction replay detected: ${replayCheck.reason}`);
  }

  // Record before broadcasting so a repeat cannot slip through while this one is in
  // flight. The txid is not known until the node answers, so the record is keyed by a
  // pre-broadcast id — and the completion below must update *that* key. Marking the real
  // txid instead looked right but addressed a record that was never stored, so
  // updateTransactionStatus silently found nothing and every record stayed 'pending'.
  const pendingKey = generateRequestId('pending');
  recordTransaction(
    pendingKey,
    origin,
    'xcp_broadcastTransaction',
    [signedTx],
    { status: 'pending' }
  );

  // A failed attempt must not hold the record 'pending', or checkReplayAttempt refuses the
  // same transaction for five minutes and the site cannot retry what never went out. Resending
  // identical signed bytes is harmless: if an earlier attempt did land and only its answer
  // was lost, the node reports the transaction as already known, which the broadcaster
  // treats as success (isAlreadyKnownError), so a retry returns the txid rather than failing.
  let result: Awaited<ReturnType<typeof walletService.broadcastTransaction>>;
  try {
    result = await walletService.broadcastTransaction(signedTx);
  } catch (error) {
    markTransactionFailed(pendingKey);
    throw error;
  }

  // Mark as successfully broadcasted
  if (result.txid) {
    markTransactionBroadcasted(pendingKey);

    // The next provider signing request may spend this transaction's change before any
    // public Bitcoin indexer can return it. Persist only outputs that are both owned by
    // this wallet and safe plain-BTC change. Storage is best-effort because the broadcast
    // has already happened and must never be reported as failed after the fact.
    if (safeChangeAddress) {
      try {
        await rememberSuccessfulBroadcast(
          signedTx,
          [safeChangeAddress]
        );
      } catch (error) {
        console.warn('[ProviderService] Failed to remember broadcast change:', error);
      }
    }
  }

  // Track successful broadcast
  await analytics.track('transaction_broadcasted');

  return result;
}
