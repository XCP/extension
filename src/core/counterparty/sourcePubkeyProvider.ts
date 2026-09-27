/**
 * Where the wallet context registers the lookup behind `getSourcePubkey` (`sourcePubkey.ts`).
 *
 * A leaf module so the wallet context, which the popup loads on its first screen, can register
 * the provider without importing the curve-point check (@noble/curves secp256k1) that reading it needs.
 */

export type SourcePubkeyProvider = (address: string) => string | null;

let provider: SourcePubkeyProvider | null = null;

/** Registered by the wallet context; addresses and their keys are runtime state. */
export function setSourcePubkeyProvider(nextProvider: SourcePubkeyProvider | null): void {
  provider = nextProvider;
}

/** The registered lookup, or null before the wallet context has loaded. */
export function getSourcePubkeyProvider(): SourcePubkeyProvider | null {
  return provider;
}
