import { useProviderSigningRequest } from '@/hooks/useProviderSigningRequest';

export function useSignMessageRequest() {
  const state = useProviderSigningRequest('sign-message');
  return { ...state, request: state.review?.request ?? null,
    approvalPolicy: state.review?.policy,
    fastestFee: state.review?.fastestFee,
    isProviderRequest: !!state.requestId,
  };
}
