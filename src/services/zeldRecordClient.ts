/**
 * The wallet's record of its ZELD outputs, as the popup updates it (see core/zeld/knownOutpoints).
 *
 * Best effort: the record only lets an approval fall back on something while the ZELD indexer is
 * down, so a failed write is logged and otherwise ignored.
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
