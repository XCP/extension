/**
 * Bitcoin Core rejects a transaction whose inputs are already gone. For a recovery that means the
 * batch list the wallet was handed no longer matches the chain — the recoverable set it was built
 * from has moved on — which is the one broadcast failure a refetch can actually fix.
 */
const STALE_INPUTS_PATTERN = /missingorspent|bad-txns-inputs|txn-mempool-conflict|already.{0,20}spent/i;

export function isStaleInputsError(message: string): boolean {
  return STALE_INPUTS_PATTERN.test(message);
}

/**
 * Bitcoin Core's answers when the node already holds the transaction, in its mempool or in a
 * block. Reaching one means an earlier attempt landed — an accept the client timed out on, or a
 * peer that relayed it first — so it is success, and the one thing it must never trigger is
 * another send of the same bytes.
 */
const ALREADY_KNOWN_PATTERN =
  /txn-already-in-mempool|txn-already-known|already in block ?chain|already known|already have transaction/i;

export function isAlreadyKnownError(message: string): boolean {
  return ALREADY_KNOWN_PATTERN.test(message);
}
