import { useProviderSigningRequest } from '@/hooks/useProviderSigningRequest';

export function useSignPsbtsRequest() {
  const state = useProviderSigningRequest('sign-psbts');
  return { ...state, request: state.review?.request ?? null,
    decodedInfo: state.review?.decodedInfo ?? null,
    approvalPolicy: state.review?.policy,
    fastestFee: state.review?.fastestFee,
    isProviderRequest: !!state.requestId,
  };
}
