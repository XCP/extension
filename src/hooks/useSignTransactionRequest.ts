import { useProviderSigningRequest } from '@/hooks/useProviderSigningRequest';

export type { DecodedTransactionInfo } from '@/core/bitcoin/transactionApprovalDecoder';

export function useSignTransactionRequest() {
  const state = useProviderSigningRequest('sign-transaction');
  return { ...state, request: state.review?.request ?? null,
    decodedInfo: state.review?.decodedInfo ?? null,
    approvalPolicy: state.review?.policy,
    fastestFee: state.review?.fastestFee,
    isProviderRequest: !!state.requestId,
  };
}
