import { useProviderSigningRequest } from '@/hooks/useProviderSigningRequest';

export function useSignPsbtRequest() {
  const state = useProviderSigningRequest('sign-psbt');
  return { ...state, request: state.review?.request ?? null,
    decodedInfo: state.review?.decodedInfo ?? null,
    approvalPolicy: state.review?.policy,
    fastestFee: state.review?.fastestFee,
    isProviderRequest: !!state.requestId,
  };
}
