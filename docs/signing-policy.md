# Signing policy

What XCP Wallet checks before it signs a website's request, how the approval screen describes and
prices it, and what the wallet cannot see. The methods and parameters themselves are in the
[Provider API](../PROVIDER.md); marketplace intent proofs are in
[Marketplace intents](marketplace-intents.md).

Every rule here runs in the extension's background on the transaction's own bytes. A website's
description of a request (an intent, a display label, the origin) can change wording, never what
can be signed.

## What this wallet will sign

`xcp_signTransaction` and `xcp_signPsbt` are for Counterparty transactions. A request is refused
outright when it is not one. Plain Bitcoin website payments use the narrower
[`xcp_signBitcoinPsbt`](../PROVIDER.md#xcp_signbitcoinpsbt) capability; origins never bypass
either policy.

- **No Counterparty content.** The transaction must either carry a Counterparty message or spend an
  input holding attached assets. Both forms count, because spending an attached UTXO moves its
  balances with no message at all. That is how an atomic swap of an attached asset works, and
  requiring a payload would refuse it. A transaction with neither is a plain Bitcoin payment, which
  a user can make in the wallet, where they choose the destination themselves. The one exception is
  a proved `fund_offers` intent (see [Marketplace intents](marketplace-intents.md#offer-funding-fund_offers)).
- **Sweeps.** A `sweep` hands every balance and asset ownership to another address in one message.
  It is available in the wallet and not through a site.
- **Oracle-priced dispensers.** Opening one, or paying one, is refused. Core applies the oracle
  address's most recent broadcast with no bound on its age
  (`ledger.other.get_oracle_last_price`), and the feed's owner can publish a new price in any block
  before the transaction confirms, so what the payment buys is decided after the signature, by a
  third party. The approval screen cannot state the outcome, so the wallet declines rather than
  showing a figure it cannot stand behind. Fixed-rate dispensers are unaffected.
- **Undecodable payloads.** A Counterparty payload the wallet cannot decode is surfaced as an
  unrecognized transaction and blocked, not rendered as an ordinary transfer.
- **Durable sell authorizations.** A `SINGLE|ANYONECANPAY` signature (or any other sighash that
  leaves outputs uncommitted) over an input that carries attached assets, or whose asset status
  cannot be verified, lets whoever holds it complete a sale of those assets at any time until the
  UTXO is spent, with the assets delivered wherever they choose. It is refused, acknowledged or not,
  unless a proved `create_listing` intent covers that exact input. `ALL|ANYONECANPAY` commits every
  output, so it stays with the attached-asset destination warning instead.
- **Assets the ledger cannot show yet.** The asset lookup asks the Counterparty ledger, which only
  reflects parsed blocks. An empty answer for a signed input is accepted only when the transaction
  that created the outpoint could not have attached anything to it: it carries no attach (or legacy
  move) naming that output, and, if the outpoint is its first non-`OP_RETURN` output, where Core
  moves attached balances, nothing it spends carries or may carry attached assets (checked up the
  unconfirmed chain, bounded). Otherwise the wallet waits for that transaction to confirm and be
  parsed, then reads the ledger again; until then signing asks for a retry. An unknown outpoint, or
  a node that cannot say how far it has parsed, is never treated as asset-free. Spending the change
  of an unconfirmed attach, or any output of an unconfirmed plain-Bitcoin fan-out or offer funding,
  is unaffected. The wallet's own recent broadcasts are trusted as before.
- **Unproved Taproot commit claims.** An `inscription` context or a `reveal` that does not prove
  out against the commit blocks signing with the reason (see
  [Taproot commits](#taproot-commits) below).

A refusal is shown to the user with its reason; the method returns a rejection to the caller.

## What the approval screen shows

Every supported message type gets a one-line description built from the transaction's own bytes,
and, separately from the Bitcoin inputs and outputs, a list of the protocol facts the headline
cannot carry: an order's price and expiry, a dividend's total cost and its per-holder XCP fee, the
UTXO an attach creates, the assets a detach releases, the blocks remaining on a BTCPay's order
match, and what each dispenser at a paid address will pay back.

Some of those require a ledger lookup, which is done against the configured Counterparty node.
Every one fails soft: a fact that cannot be resolved is omitted and the screen says less. Nothing
about whether a transaction can be signed depends on that node being reachable: the decode,
re-pack proof and structural checks all run on the bytes locally.

How the screen is laid out, and the wording rules it follows, are in
[Approval screens](approval-screens.md).

## How the approval screen prices a request

The summary counts an output as returning to the signer only when the signature commits to it.
Under `SINGLE|ANYONECANPAY` (`0x83`) that is the output sharing the signed input's index; any
*other* output paying the signer is shown as "may not return to you", the headline reflects that
worst case, and signing is gated until the signer acknowledges the amount.

The warning copy preserves the same distinction. `ALL | ANYONECANPAY` is an informational note
that other funding inputs may be added and explicitly says that every current output is fixed.
`SINGLE | ANYONECANPAY` says that only the paired output is fixed; redirectable signer funds
escalate to danger. The screen does not use the generic and inaccurate "inputs or outputs may be
added" copy for both flags.

Attached-asset review likewise presents one outcome, not several warnings for the same movement.
When the destination is resolved, the destination and exact asset list share one row: movement to
the wallet's own output or a detach back to its own address is information, while delivery outside
the wallet or a signature that leaves delivery flexible is danger (and, outside a proved listing,
blocked as a durable sell authorization). A failed asset lookup blocks with a retry because an
unknown UTXO is never treated as asset-free; when the reason is an unconfirmed transaction that may
attach assets to the input, the screen names that transaction and asks to retry after it confirms.

When local transaction verification blocks approval, the popup recommends retrying or asking the
site to rebuild the request. It does not instruct the user to disable strict verification from the
signing screen.

An input whose embedded prevout cannot be attributed to an address is treated as potentially the
signer's, so its sighash reaches the at-risk calculation rather than being skipped.

### Mixed sighash flags

When signed inputs carry different flags, the summary prices only the outputs that every
`ANYONECANPAY` input covers on its own. Such an input is detachable: whoever holds the PSBT can
keep it, drop the rest, and its signature travels with it, so an additional `SIGHASH_ALL` input
cannot vouch for outputs a detachable input leaves free. In practice, batching two
`SINGLE | ANYONECANPAY` listings into one PSBT prices **both** proceeds outputs as at risk, since
each signature covers only the output at its own index and neither covers the other's. Submit one
listing per PSBT to keep the no-extra-prompt path.

## Taproot commits

Counterparty's Taproot encoding is a commit, which pays a P2TR output whose script tree holds an
envelope carrying the message, and a reveal, which spends that output by the envelope's leaf and so
publishes the message. Nothing in the commit's own bytes shows that message. The wallet supports
two ways to show it before the user funds the commit:

- **`inscription`: the user signs the reveal.** The site names the reveal leaf and internal key.
  The wallet requires the unspendable (NUMS) internal key and the user's own Taproot output key in
  the leaf, re-derives the commit address, requires every other output to be change, and shows the
  decoded message on the commit's approval. The reveal is a second `xcp_signPsbt` request and a
  second approval. The committed BTC can be spent only by a reveal of that leaf, so if the user
  declines the reveal it stays in the commit output until the user signs one. See
  [Taproot commits with `inscription`](../PROVIDER.md#taproot-commits-with-inscription).
- **`reveal`: the site signs the reveal.** The site sends its signed reveal with the commit. The
  wallet proves that the reveal spends this commit's output by a leaf the output key commits to,
  decodes the message from that leaf, shows it as the commit's action, and discloses what the site
  still controls in the reveal's outputs. See
  [Taproot commits and reveals](../PROVIDER.md#taproot-commits-and-reveals).

Either claim that does not prove out blocks signing with the reason.

## What the wallet cannot see

The checks above read the transaction's bytes. Some things a transaction does are not in its
bytes, and some facts come from services the wallet does not control.

- **What a script address commits to.** A P2TR, P2WSH or P2SH address hides its script until the
  output is spent, so the wallet cannot tell what a payment to one is for. Payments to script
  addresses you don't control can carry risk for addresses that hold Counterparty assets; the
  wallet shows a caution in that case. A site funding a Counterparty Taproot commit should send it
  with `inscription` or `reveal` ([Taproot commits](#taproot-commits)), so the wallet can show the
  message it pays for.
- **Ledger facts.** Attached balances, asset divisibility and metadata, order and dispenser state
  come from the configured Counterparty node. Divisibility moves the decimal point the screen shows.
  An unavailable or inconsistent answer is shown as unknown or asks for a retry; it never reads as
  "nothing attached".
- **Events after signing.** The signature fixes the transaction, not the chain around it. An
  oracle-priced dispenser is refused for this reason; a fixed-rate dispenser can still be emptied or
  closed by another transaction before this one confirms.
- **Broadcasts.** `xcp_broadcastTransaction` relays any signed transaction for a connected site,
  without an approval; the review happens when a transaction is signed.

The trust boundaries behind these limits are described in [AUDIT.md](../AUDIT.md#threat-model) and
in the design note in [`unpack/verify.ts`](../src/core/counterparty/unpack/verify.ts).
