/**
 * Market signing keys this wallet trusts for `funded_policy_offer_v1`, pinned in the wallet build.
 *
 * A policy offer's only executed script is `<K_m> OP_CHECKSIG`: whoever holds K_m's private key
 * can spend the bidder's offer output. A website names K_m in its request, so a site that could
 * also choose which K_m the wallet accepts could put its own key there and take the funds. This
 * list is therefore compiled into the wallet and never read from a request, from storage, or from
 * the network. Adding a key is a reviewed wallet release; rotating the market key (spec §9.6) adds
 * the new key here and removes the old one after the last offer committing to it has expired.
 *
 * PLACEHOLDER: the production DIGIRARE market key has not been generated yet (spec §9.5). Until
 * its x-only public key is added below, every `fund_policy_offer` request is refused as naming an
 * unpinned key. That is the intended fail-closed state, not a bug.
 */
export interface PinnedPolicyMarketKey {
  /** K_m as 64 lowercase hex characters (BIP340 x-only). */
  xOnlyKey: string;
  /** Who holds the key, named on the review. Wallet-supplied, never taken from the site. */
  operator: string;
}

export const PINNED_POLICY_OFFER_MARKET_KEYS: readonly PinnedPolicyMarketKey[] = Object.freeze([
  // TODO(policy-offer): { xOnlyKey: '<production K_m, 64 hex>', operator: 'Digirare' },
]);
