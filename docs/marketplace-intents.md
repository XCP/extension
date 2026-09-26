# Marketplace intents

`xcp_signPsbt` and `xcp_signPsbts` accept an optional `counterparty-marketplace` intent alongside a
PSBT. The intent is an untrusted claim used to ask for a semantic approval ("list RAREPEPE for
250,000 sats"), not permission to skip validation. The wallet proves every term against the PSBT's
bytes, its prevouts and the Counterparty ledger before showing that review; a false claim is
blocked, and an unavailable lookup asks the user to retry.

The methods are documented in the [Provider API](../PROVIDER.md#xcp_signpsbt). The general signing
rules these proofs sit on top of are in [Signing policy](signing-policy.md).

## Wire format

Every intent is an object with `standard: 'counterparty-marketplace'`, `version: 1`, and an
`action`. This wallet version accepts these actions:

| Action | Where | Purpose |
|---|---|---|
| `attach_for_listing` | `xcp_signPsbt`, bundles | Attach an asset to a new UTXO that a listing will sell |
| `prepare_asset` | `xcp_signPsbt`, bundles | Prepare an asset UTXO for listing |
| `prepare_bulk_fanout` | `xcp_signPsbt`, bundles | Split funding into UTXOs for a bulk operation |
| `create_listing` | `xcp_signPsbt`, bundles | A seller's `SINGLE\|ANYONECANPAY` listing signature; `listingContext: { mode: 'reprice' }` marks a reprice of an existing listing |
| `buy_listings` | `xcp_signPsbt` | A buyer completes 1..20 listings |
| `fund_offers` | `xcp_signPsbt` | A clean-Bitcoin self-send that sets aside offer-backing outputs |
| `authorize_exact_offer` | `xcp_signPsbt`, bundles | A bidder's offer on one exact asset UTXO |
| `accept_exact_offer` | `xcp_signPsbt`, bundles | A seller completes an exact offer |
| `bump_acceptance_fee` | `acceptance-cpfp` bundle only | A CPFP child that pays the fee for an accepted exact offer |
| `fund_policy_offer` | `xcp_signPsbts` only | Bidder funding for a `funded_policy_offer_v1` policy offer, one alternative per request |
| `accept_policy_offer` | `xcp_signPsbt` | A seller's acceptance of a policy offer; the wallet signs child input 1 only |

Any other action is refused as unsupported by this wallet version.

This page documents `create_listing` and `fund_offers` in full. The other schemas are defined by
the marketplace integration that sends them; their exact fields and bounds are the `*IntentClaim`
types and parsers in
[`src/core/counterparty/marketplaceIntent.ts`](../src/core/counterparty/marketplaceIntent.ts) (and
`bump_acceptance_fee` in
[`src/core/counterparty/marketplaceBundle.ts`](../src/core/counterparty/marketplaceBundle.ts)).
The parser rejects a claim that does not match those types exactly.

## Listings (`create_listing`)

A listing is signed `SINGLE|ANYONECANPAY` over the asset input, which commits only to the output at
the same index. So:

- Put the seller's proceeds at the **same index as the input being signed**.
- Do **not** add another output back to the seller. It carries no guarantee (the buyer can repoint
  it and the signature still verifies), so the wallet will not price it as change.

A listing built that way has nothing at risk and signs with no extra prompt.

```js
await xcpwallet.request({
  method: 'xcp_signPsbt',
  params: [{
    hex: listingPsbtHex,
    signInputs: { [seller]: [1] },
    // Absolute PSBT indices: input 0 is not signed, but occupies slot 0.
    sighashTypes: [0x01, 0x83],
    intent: {
      standard: 'counterparty-marketplace',
      version: 1,
      action: 'create_listing',
      operationId: 'preflight-id',
      protocolVersion: 'counterparty_attach_listing_v1',
      assets: [{
        asset: 'RAREPEPE',
        quantityRaw: '1',
        sourceOutpoint: { txid: '<64-char txid>', vout: 0 }
      }],
      seller,
      priceSats: 250000,
      utxoValueSats: 546,
      guaranteedSellerPaymentSats: 250546,
      delivery: { mode: 'buyer_selected_detach' },
      signingRequestExpiresAt: 1711130400,
      marketplaceExpiresAt: null,
      bitcoinExpiresAt: null
      // listingContext: { mode: 'reprice' }  // optional: this replaces an existing listing's price
    }
  }]
});
```

The wallet independently checks the two-input/two-output template, null and unsigned buyer slot,
exact attached outpoint and raw quantity, seller identity and asset UTXO value, only input 1
requested with `SINGLE|ANYONECANPAY`, and exact asset UTXO-plus-price payment at output 1. It also
states that buyer funding and the detach destination remain flexible. A false claim is blocked; an
unavailable asset lookup asks the user to retry rather than treating the UTXO as empty. Marketplace
expiry is displayed as service policy, not Bitcoin signature expiry.

## Offer funding (`fund_offers`)

Before a buyer can authorize exact offers, a clean-Bitcoin self-send sets aside one output per
offered edition. It carries no Counterparty content, so the Counterparty-only rule would refuse it;
a proved `fund_offers` intent is the one narrow exception, and only that rule is lifted:

```js
await xcpwallet.request({
  method: 'xcp_signPsbt',
  params: [{
    hex: fundingPsbtHex,
    signInputs: { [bidder]: [0, 1] },
    sighashTypes: [0x01, 0x01],
    intent: {
      standard: 'counterparty-marketplace',
      version: 1,
      action: 'fund_offers',
      operationId: 'offer-funding:<expected txid>',
      protocolVersion: 'exact_offer_v1',
      assets: [],
      bidder,
      target: { scope: 'collection', collection: 'rare-pepe', policy: 'series 1' }, // or { scope: 'asset', asset }
      priceSats: 8000,
      platformFeeSats: 1000,
      delivery: { mode: 'detached' },             // or { mode: 'attached', utxoValueSats: 330 }
      fundingInputs: [
        { txid: '<64-char txid>', vout: 0, valueSats: 15000 },
        { txid: '<64-char txid>', vout: 3, valueSats: 5000 }
      ],
      fundingValueSats: 20000,
      slotCount: 2,
      slotValueSats: 9000,                        // price + platform fee (+ delivery UTXO)
      networkFeeSats: 400,
      changeSats: 1600,
      expectedTxid: '<64-char txid>',
      marketplaceExpiresAt: 1711130400
    }
  }]
});
```

The wallet proves the transaction id; that the inputs are exactly the claimed outpoints and values,
all owned by the bidder, unsigned, and free of attached assets (a failed lookup asks for a retry);
that every input is signed `SIGHASH_ALL`; that the outputs are exactly `slotCount` outputs of
`slotValueSats` plus optional change, all paying the bidder, with no data output; that each slot is
the price plus the platform fee plus any attached-delivery UTXO; and that the fee equals inputs
minus outputs. The target is display context only: the funding commits to no asset. A seller can
take a slot only through a later `authorize_exact_offer` signature, which is its own approval.

- **`sighashTypes` must be `0x01` (`SIGHASH_ALL`) for every input, Taproot included.**
  `SIGHASH_DEFAULT` (`0x00`) commits to the same data but is refused for this intent: the wallet
  proves the exact flag, so an explicit or PSBT-embedded `0x00` on a P2TR input is blocked.
- `fundingInputs` lists 1..60 distinct outpoints, the most the approval screen checks for
  attached assets; a repeated outpoint is refused.
- `slotCount` is 1..20.
- `target.asset` must be a Counterparty asset name (named, numeric `A…`, or a subasset longname).
  `target.collection` and `target.policy` are cleaned of control and bidi characters, collapsed to
  one line, shortened, and shown in quotation marks as the website's own words.

## Linked bundles

`xcp_signPsbts` signs 1..8 linked requests (1..100 for `fund-policy-offer`) in one approval,
returning all signatures or none. The kinds, their item counts, and how a site learns which kinds a
wallet supports are listed under [`xcp_signPsbts`](../PROVIDER.md#xcp_signpsbts). Each item is
first proved on its own exactly as a single `xcp_signPsbt` request would be; a bundle then adds the
cross-item checks below.

### `attach-and-list`

The listing's asset input is the attach's output, which is not broadcast yet, so no Counterparty
ledger can report its balance. The wallet uses the attach instead, read from its own bytes and never
from the intent: the outpoint is the attach PSBT's unsigned txid and the asset output index (the
first non-OP_RETURN output, which an explicit `destination_vout` must equal); the asset and raw
quantity are those of the locally decoded attach message; the owner and value are that output's
script and amount. This evidence stands in for the ledger lookup on listing input 1 only when the
attach item itself did not fail its proof, and only when listing input 1 is exactly that outpoint
with that owner and value; any difference blocks the bundle. If the ledger does report assets on
that outpoint, its answer is kept and checked like any other listing. A failed lookup is replaced
only when it is explained by the attach itself (the explorer reports the attach txid as unknown, or
the lookup names the attach as the pending transaction); an outage stays a retry. Because
Counterparty also moves every balance on the attach's *inputs* onto the listed output, the listing
is proved only after every attach input's parent transaction is confirmed at or below
Counterparty's parsed block height and each input re-reads as asset-free; an unconfirmed or
unindexed parent, or any unanswerable lookup, asks for a retry. The attach message's quantity and
destination must be plain decimal digits, as Core requires. A `create_listing` outside this pair
still requires the ledger, and a listing in this pair cannot carry `listingContext`. For a Legacy
asset source the attach txid changes when it is signed; the wallet signs the attach first, confirms
its unsigned bytes did not change, and moves listing input 1 to the final txid (same vout) before
signing the listing, so the listing signature covers exactly the proved attach output.

### `authorize-offers`

Several exact targets backed by one buyer funding UTXO, as returned by the marketplace's batch
preflight. Each item is proved exactly as a single `authorize_exact_offer` (only input 0,
`SIGHASH_ALL`, never `SINGLE|ANYONECANPAY`; fixed outputs, fee, and delivery; the target's attached
asset from the ledger). The bundle additionally requires the same bidder,
`bitcoinInvalidation.outpoint`, delivery, `priceSats`, and `platformFeeSats` on every item, and
distinct `authorizationId`, `operationId`, target outpoint, and `expectedTxid`, none of which may be
the funding outpoint. Because every signature spends the same input 0, at most one can ever settle;
the review states this once, with every target under its ledger-proved quantity, and labels the
expiry "Latest marketplace expiry" when the targets' expiries differ. The acknowledgement policy is
the single authorization's, applied per item.

### `acceptance-cpfp`

An `accept_exact_offer` parent and a `bump_acceptance_fee` child, in that order. The child must
claim exactly one asset, use `protocolVersion: 'exact_offer_v1'`, and spend the proved parent's
seller-proceeds output 1. This kind is recognized by its shape (two requests, the first an
`accept_exact_offer`) and is not listed in `marketplaceBundles`.

### `fund-policy-offer`

The alternatives of one policy-offer funding set, one request per alternative parent. Every
alternative spends the identical funding inputs and anchor, so at most one can ever be mined. The
requests are admitted only when they share the operation, bidder, keys, delivery, funding inputs,
anchor and marketplace fee, and name distinct parent transactions. Each request may repeat the
complete claim (request *i* signs alternative *i*) or carry the shared claim with only its own
alternative; the compact form keeps a 100-alternative set under the 1 MB request limit.
`fund_policy_offer` is refused through `xcp_signPsbt`, because the funding inputs are proved once
for the whole set.

### `bulk-listing`, `bulk-attach`, `prepare-assets`, `bulk-fanout`

1..8 requests of one action (`create_listing`, `attach_for_listing`, `prepare_asset`, or
`prepare_bulk_fanout`), with one seller identity and distinct targets. `prepare-assets` requests
share one operation and asset source. `bulk-fanout` takes at most 5 parents, all in one operation,
with strictly increasing batch indices and distinct funding outpoints; a resumed fan-out may skip
indices that already completed.
