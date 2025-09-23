/**
 * Hook to handle provider request recovery after popup close or wallet lock
 *
 * Addresses real-world scenarios:
 * - User closes popup immediately
 * - Wallet auto-locks (1, 5, 15, 30 min settings)
 * - User walks away mid-transaction
 * - Browser/extension crashes
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';
import { composeRequestStorage } from '@/utils/storage/composeRequestStorage';
import { signMessageRequestStorage } from '@/utils/storage/signMessageRequestStorage';

interface PendingRequest {
  id: string;
  type: 'compose' | 'sign';
  origin: string;
  path: string;
  timestamp: number;
  data: any;
}

export function useProviderRequestRecovery() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authState } = useWallet();
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);

  // Check for pending requests on mount and after unlock
  useEffect(() => {
    checkForPendingRequests();
  }, [authState]); // Re-check when auth state changes (unlock)

  // Check for pending requests when navigating to index
  useEffect(() => {
    if (location.pathname === '/index' || location.pathname === '/') {
      checkForPendingRequests();
    }
  }, [location.pathname]);

  async function checkForPendingRequests() {
    try {
      // Don't check if we're already on a compose page with a request ID
      const searchParams = new URLSearchParams(location.search);
      if (searchParams.has('composeRequestId') || searchParams.has('signMessageRequestId')) {
        return; // Already handling a request
      }

      // Check compose requests
      const composeRequests = await composeRequestStorage.getAll();
      const validComposeRequests = composeRequests.filter(req => {
        const age = Date.now() - req.timestamp;
        // Only show recovery for requests older than 10 seconds (actually abandoned)
        // Fresh requests will navigate directly to the form
        return age > 10 * 1000 && age < 5 * 60 * 1000;
      });

      if (validComposeRequests.length > 0) {
        const mostRecent = validComposeRequests[0];
        setPendingRequest({
          id: mostRecent.id,
          type: 'compose',
          origin: mostRecent.origin,
          path: getComposeRoutePath(mostRecent.type, mostRecent.params),
          timestamp: mostRecent.timestamp,
          data: mostRecent.params
        });
        setShowRecoveryPrompt(true);
        return;
      }

      // Check sign message requests
      const signRequests = await signMessageRequestStorage.getAll();
      const validSignRequests = signRequests.filter(req => {
        const age = Date.now() - req.timestamp;
        // Only show recovery for requests older than 10 seconds (actually abandoned)
        return age > 10 * 1000 && age < 5 * 60 * 1000;
      });

      if (validSignRequests.length > 0) {
        const mostRecent = validSignRequests[0];
        setPendingRequest({
          id: mostRecent.id,
          type: 'sign',
          origin: mostRecent.origin,
          path: '/actions/sign-message',
          timestamp: mostRecent.timestamp,
          data: { message: mostRecent.message }
        });
        setShowRecoveryPrompt(true);
      }
    } catch (error) {
      console.error('Failed to check for pending requests:', error);
    }
  }

  function getComposeRoutePath(composeType: string, params?: any): string {
    // For send, we need to include the asset in the path
    if (composeType === 'send' && params?.asset) {
      return `/compose/send/${params.asset}`;
    }

    const routeMap: { [key: string]: string } = {
      'send': '/compose/send/XCP', // Default to XCP if no asset specified
      'order': '/compose/order',
      'dispenser': '/compose/dispenser',
      'dispense': '/compose/dispenser/dispense',
      'fairminter': '/compose/fairminter',
      'fairmint': '/compose/fairmint',
      'dividend': '/compose/dividend',
      'sweep': '/compose/sweep',
      'btcpay': '/compose/btcpay',
      'cancel': '/compose/cancel',
      'dispenser-close-by-hash': '/compose/dispenser/close-by-hash',
      'bet': '/compose/bet',
      'broadcast': '/compose/broadcast',
      'attach': '/compose/utxo/attach',
      'detach': '/compose/utxo/detach',
      'move-utxo': '/compose/utxo/move',
      'destroy': '/compose/destroy',
      'issue-supply': '/compose/issuance/issue-supply',
      'lock-supply': '/compose/issuance/lock-supply',
      'reset-supply': '/compose/issuance/reset-supply',
      'transfer': '/compose/issuance/transfer-ownership',
      'update-description': '/compose/issuance/update-description',
      'lock-description': '/compose/issuance/lock-description'
    };
    return routeMap[composeType] || '/compose/send/XCP';
  }

  async function resumeRequest() {
    if (!pendingRequest) return;

    try {
      // Navigate to the appropriate page with the request ID
      const queryParam = pendingRequest.type === 'compose'
        ? `composeRequestId=${pendingRequest.id}`
        : `signMessageRequestId=${pendingRequest.id}`;

      navigate(`${pendingRequest.path}?${queryParam}`);
      setShowRecoveryPrompt(false);
    } catch (error) {
      console.error('Failed to resume request:', error);
    }
  }

  async function cancelRequest() {
    if (!pendingRequest) return;

    try {
      if (pendingRequest.type === 'compose') {
        await composeRequestStorage.remove(pendingRequest.id);
        // Emit cancellation event for the dApp
        chrome.runtime.sendMessage({
          type: 'PROVIDER_REQUEST_CANCELLED',
          requestId: pendingRequest.id,
          reason: 'User cancelled after recovery prompt'
        });
      } else {
        await signMessageRequestStorage.remove(pendingRequest.id);
        chrome.runtime.sendMessage({
          type: 'SIGN_REQUEST_CANCELLED',
          requestId: pendingRequest.id,
          reason: 'User cancelled after recovery prompt'
        });
      }

      setPendingRequest(null);
      setShowRecoveryPrompt(false);
    } catch (error) {
      console.error('Failed to cancel request:', error);
    }
  }

  return {
    pendingRequest,
    showRecoveryPrompt,
    resumeRequest,
    cancelRequest,
    requestAge: pendingRequest
      ? Math.floor((Date.now() - pendingRequest.timestamp) / 1000) // seconds
      : 0
  };
}