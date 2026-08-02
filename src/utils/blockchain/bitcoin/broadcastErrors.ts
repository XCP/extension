/**
 * Bitcoin Core rejects a transaction whose inputs are already gone. For a recovery that means the
 * batch list the wallet was handed no longer matches the chain — the recoverable set it was built
 * from has moved on — which is the one broadcast failure a refetch can actually fix.
 */
const STALE_INPUTS_PATTERN = /missingorspent|bad-txns-inputs|txn-mempool-conflict|already.{0,20}spent/i;

export function isStaleInputsError(message: string): boolean {
  return STALE_INPUTS_PATTERN.test(message);
}
