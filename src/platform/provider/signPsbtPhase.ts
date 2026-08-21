/**
 * Sign one already-proved phase in order, but disclose results only as a complete set.
 * Earlier signatures may exist in local memory if a later signer fails; callers cannot
 * observe them because the result array is returned only after every call completes.
 */
export async function signPsbtPhaseForDelivery<T>(
  items: T[],
  sign: (item: T, index: number) => Promise<string>,
): Promise<string[]> {
  if (items.length < 1 || items.length > 8) {
    throw new Error('PSBT signing phase must contain 1..8 transactions');
  }
  const results: string[] = [];
  for (const [index, item] of items.entries()) {
    results.push(await sign(item, index));
  }
  return results;
}
