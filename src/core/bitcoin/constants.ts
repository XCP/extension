/** Bitcoin consensus and relay-policy numbers shared across transaction builders and checks. */

/** nSequence that signals BIP125 replaceability and keeps nLockTime enforced. */
export const RBF_SEQUENCE = 0xfffffffd;

/** The dust threshold this wallet applies to an ordinary output, in satoshis. */
export const DUST_LIMIT_SATS = 546;

/** The largest OP_RETURN data payload Bitcoin Core relays by default, in bytes. */
export const MAX_OP_RETURN_DATA_BYTES = 80;
