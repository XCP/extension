/** Bitcoin consensus and relay-policy numbers shared across transaction builders and checks. */

/** nSequence an input takes when it does not set one: final, no BIP125 replaceability. */
export const DEFAULT_SEQUENCE = 0xffffffff;

/** nSequence that signals BIP125 replaceability and keeps nLockTime enforced. */
export const RBF_SEQUENCE = 0xfffffffd;

/** Satoshis in one bitcoin. */
export const SATS_PER_BTC = 100_000_000;

/** The dust threshold this wallet applies to an ordinary output, in satoshis. */
export const DUST_LIMIT_SATS = 546;

/** The largest OP_RETURN data payload Bitcoin Core relays by default, in bytes. */
export const MAX_OP_RETURN_DATA_BYTES = 80;

/**
 * Bitcoin Core's default `-minrelaytxfee` since 29.1, in sats per 1,000 vbytes: 0.1 sat/vB, the
 * lowest rate the wallet's own fee input accepts. A transaction paying less is not relayed.
 */
export const MIN_RELAY_FEE_SATS_PER_KVB = 100;

/** Bitcoin Core's default `-dustrelayfee`, in sats per 1,000 vbytes, which sets each output's dust threshold. */
export const DUST_RELAY_FEE_SATS_PER_KVB = 3_000;
