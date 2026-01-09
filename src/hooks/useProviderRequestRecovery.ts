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
import { signMessageRequestStorage } from '@/utils/storage/signMessageRequestStorage';
import { signPsbtRequestStorage } from '@/utils/storage/signPsbtRequestStorage';

interface PendingRequest {
  id: string;
  type: 'sign-message' | 'sign-psbt';
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
      // Check sign message requests
      const signMessageRequests = await signMessageRequestStorage.getAll();
      const validSignMessageRequests = signMessageRequests.filter(req => {
        const age = Date.now() - req.timestamp;
        return age < 5 * 60 * 1000;
      });

      if (validSignMessageRequests.length > 0) {
        const mostRecent = validSignMessageRequests[0];
        setPendingRequest({
          id: mostRecent.id,
          type: 'sign-message',
          origin: mostRecent.origin,
          path: '/provider/approve-sign-message',
          timestamp: mostRecent.timestamp,
          data: { message: mostRecent.message }
        });
        setShowRecoveryPrompt(true);
        return;
      }

      // Check sign PSBT requests
      const signPsbtRequests = await signPsbtRequestStorage.getAll();
      const validSignPsbtRequests = signPsbtRequests.filter(req => {
        const age = Date.now() - req.timestamp;
        return age < 5 * 60 * 1000;
      });

      if (validSignPsbtRequests.length > 0) {
        const mostRecent = validSignPsbtRequests[0];
        setPendingRequest({
          id: mostRecent.id,
          type: 'sign-psbt',
          origin: mostRecent.origin,
          path: '/provider/approve-psbt',
          timestamp: mostRecent.timestamp,
          data: { psbtHex: mostRecent.psbtHex }
        });
        setShowRecoveryPrompt(true);
      }
    } catch (error) {
      console.error('Failed to check for pending requests:', error);
    }
  }

  async function resumeRequest() {
    if (!pendingRequest) return;

    try {
      // Navigate to the appropriate page with the request ID
      const queryParam = pendingRequest.type === 'sign-message'
        ? `signMessageRequestId=${pendingRequest.id}`
        : `signPsbtRequestId=${pendingRequest.id}`;

      navigate(`${pendingRequest.path}?${queryParam}`);
      setShowRecoveryPrompt(false);
    } catch (error) {
      console.error('Failed to resume request:', error);
    }
  }

  async function cancelRequest() {
    if (!pendingRequest) return;

    try {
      if (pendingRequest.type === 'sign-message') {
        await signMessageRequestStorage.remove(pendingRequest.id);
        chrome.runtime.sendMessage({
          type: 'SIGN_MESSAGE_REQUEST_CANCELLED',
          requestId: pendingRequest.id,
          reason: 'User cancelled after recovery prompt'
        });
      } else if (pendingRequest.type === 'sign-psbt') {
        await signPsbtRequestStorage.remove(pendingRequest.id);
        chrome.runtime.sendMessage({
          type: 'SIGN_PSBT_REQUEST_CANCELLED',
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