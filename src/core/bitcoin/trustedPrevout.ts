/** A locally trusted previous output, independent of how it is persisted. */
export interface TrustedBroadcastPrevout {
  txid: string;
  vout: number;
  address: string;
  value: number;
  scriptPubKey: string;
  rawTxHex: string;
}

/** Platform-supplied lookup used by core without depending on extension storage. */
export type TrustedPrevoutResolver = (
  txid: string,
  vout: number,
  address?: string
) => Promise<TrustedBroadcastPrevout | null>;

export const noTrustedPrevout: TrustedPrevoutResolver = async () => null;
