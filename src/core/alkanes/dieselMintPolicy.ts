import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';

// Conservative stop for the earliest staged activation, pending validation of its paid-mint
// rules. This does not claim that the staged protocol is deployed on the configured service.
export const DIESEL_MINT_REVALIDATION_HEIGHT = 966_000;

/** Recheck at compose and immediately before signing: a preview can outlive its safe height. */
export async function isDieselMintHeightAllowed(): Promise<boolean> {
  try {
    const height = await getCurrentBlockHeight(true);
    return Number.isSafeInteger(height) && height > 0
      && height + 1 < DIESEL_MINT_REVALIDATION_HEIGHT;
  } catch {
    return false;
  }
}
