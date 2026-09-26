/**
 * The wallet's record of script addresses already paid, as the review screens use it.
 *
 * The record lives in the encrypted keychain, in the background (see core/wallet/scriptRecipients).
 * Both calls are best effort: a failed read shows the notice, which is the safe way to be wrong,
 * and a failed write only means the notice is shown again next time.
 */
import { getWalletServiceClient } from '@/services/walletServiceClient';

/** The script addresses `payer` has already paid. Empty when the wallet cannot say. */
export async function getKnownScriptRecipients(payer: string): Promise<string[]> {
  try {
    return await getWalletServiceClient().getKnownScriptRecipients(payer);
  } catch {
    return [];
  }
}

/** Record that `payer` paid `recipients`. */
export async function recordScriptRecipients(payer: string, recipients: string[]): Promise<void> {
  if (recipients.length === 0) return;
  try {
    await getWalletServiceClient().recordScriptRecipients(payer, recipients);
  } catch (err) {
    console.error('Failed to record script payment recipients:', err);
  }
}
