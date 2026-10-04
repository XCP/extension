/**
 * The wallet's record of its ZELD outputs, as the popup updates and reads it (see
 * core/zeld/knownOutpoints).
 *
 * Best effort: the record only lets an approval or the balance list fall back on something while
 * the ZELD indexer is down, so a failed write is logged and otherwise ignored, and a failed read
 * counts as no record.
 */
import type { ZeldOutpointUpdate } from '@/core/zeld/knownOutpoints';
import { getWalletServiceClient } from '@/services/walletServiceClient';

export async function recordZeldOutpoints(address: string, update: ZeldOutpointUpdate | null): Promise<void> {
  if (!update || ((update.add?.length ?? 0) === 0 && (update.remove?.length ?? 0) === 0 && !update.replace)) return;
  try {
    await getWalletServiceClient().recordZeldOutpoints(address, update);
  } catch (err) {
    console.warn('Failed to record ZELD outputs:', err);
  }
}

/** Whether the record says `address` holds ZELD: an output with a nonzero or unknown amount. */
export async function recordShowsZeld(address: string): Promise<boolean> {
  try {
    return (await getWalletServiceClient().getKnownZeldOutpoints(address)).some(known => known.balance !== '0');
  } catch {
    return false;
  }
}
