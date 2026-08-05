# Feasibility: derive the transaction locally and compare, instead of field-by-field verification

Research against counterparty-core `ca2496dd`. Every claim below cites the source that supports it.

## The finding that settles the design question

**counterparty-core already validates its own composition exactly the way we should validate its
output.** `lib/api/composer.py::check_transaction_sanity(tx_info, composed_tx, ...)` runs after every
compose and asserts:

1. **Value conservation** — `total_out == btc_out + btc_change`, `btc_in == total_out + btc_fee`,
   `sum(inputs_values) == btc_in`.
2. **Source binds to the first input** — the first input's script must belong to `source`.
3. **Destinations match outputs positionally** — for each `destinations[i] = (address, value)`, the
   i-th vout must pay that address, and its value must equal `value` (or the dust size when the
   destination carries none).
4. **The message is byte-identical** —
   ```python
   _, _, _, tx_data, _, _ = decoded_tx["parsed_vouts"]
   if tx_data != data:
       raise exceptions.ComposeError("Sanity check error: data does not match the output data")
   ```

That last check is the whole thesis: **one byte comparison, not a hundred field comparisons.** The
protocol's own authors treat "did we compose what was asked" as an equality test over the message
bytes plus a structural check over the envelope.

## The seam: what is locally derivable

`compose_transaction` (composer.py) splits cleanly in two:

```
tx_info = compose_data(db, name, params)      # → (source, destinations, data)   ← DERIVABLE
result  = construct(db, tx_info, params)      # inputs, change, fee, dust        ← NOT DERIVABLE
check_transaction_sanity(tx_info, result, …)  # the four checks above
```

- **`data` (the Counterparty message)** is a pure function of the user's intent plus asset metadata.
  It is the artifact that carries every field our ~15 verifiers currently pick apart one at a time.
- **`destinations`** is a list of `(address, value)` derived from intent — this is exactly the
  output-destination information our verification has no coverage of today.
- **The envelope** (which UTXOs, how much change, what fee) genuinely depends on server-side state
  and cannot be derived. It does not need to be: it is checked structurally (inputs are mine, values
  conserve, fee bounded) — which is what `checkTransactionFee` and `computeMoneyMovement` already do.

## What the extension already has

Local derivation of `data` needs four primitives. Three exist:

| Primitive | Status |
|---|---|
| asset name → numeric asset id | **exists** — `unpack/assetId.ts::assetNameToId` |
| address → packed bytes | **exists** — `unpack/address.ts::packAddress` (modern + legacy) |
| CBOR **encoder** | **missing in src** — but a working one already lives in `__tests__/cbor-messages.test.ts::encodeCbor` (~40 lines), written to mirror `cbor2.dumps` |
| per-type message packers | **missing** — but each is the mirror of an unpacker we already have and have verified against core |

So this is not a rewrite. It is: promote the test CBOR encoder into `src`, write ~15 packers (the
wallet only composes ~15 of the 24 types), and build an expected-destinations function per compose
type.

## What it would replace

Everything in the "enumeration" column below collapses into the "structural" column:

| Today (enumerated, fails open) | Proposed (structural, fails closed) |
|---|---|
| ~15 per-type verifiers, 100+ field comparisons | 1 byte-equality on `data` |
| Per-field "what does absent mean" semantics (the guard sweep, the memo bug, lock/reset, dispenser open_address) | none — defaults are whatever our packer produces, and the bytes either match or they don't |
| Message types with **no** verifier at all (dividend, fairminter, fairmint, broadcast, attach, detach, btcpay, move) reach the user as "verified" | covered automatically — they are just bytes |
| Output destinations **never verified** (BTC sends, dispense, btcpay, issuance `transfer_destination`) — the top open finding | positional destination check, mirroring core |
| A new protocol field is silently unchecked | a new field changes the bytes → loud mismatch |

It also subsumes most of the open findings from `RED-TEAM-FINDINGS.md` rather than fixing them
one by one.

## The honest risks

1. **Fail-closed cuts both ways — this is the 0.6.1 incident by design.** If core changes an encoding
   and our packer lags, *every* transaction of that type mismatches and the wallet blocks it. That is
   precisely what happened when `taproot_support` moved composition to CBOR. Byte-equality makes such
   a drift immediate and total instead of silent. That is the right trade *only if* paired with:
   - **A CI oracle (this is the mitigation that makes the whole thing safe).** Core's compose API
     accepts a `return_only_data` construct param that returns just the message bytes:
     ```python
     if construct_params.get("return_only_data", False):
         return {"data": config.PREFIX + data if data else None}
     ```
     So CI can, for every message type and a matrix of parameters, ask a real node for the canonical
     bytes and assert our packer produces them exactly. We can *prove* equivalence rather than hope
     for it — and catch protocol drift before release rather than in users' hands.
   - An explicit policy for "cannot derive → cannot verify": block, or degrade to a named warning.
     The strict-verification setting already exists; this makes its meaning precise.

2. **Server-derived values.** A reissuance's divisibility and description, and a new pool's LP asset,
   are filled in from ledger state the request does not carry. These must be fetched (the wallet
   already fetches asset info for display) or declared explicitly unverifiable. Note this converts
   today's *implicit, unbounded* gap into an *explicit, short* list.

3. **Quantity normalization** needs divisibility to convert display units to base units — again
   already fetched for the UI, but it becomes correctness-critical rather than cosmetic.

## Maintenance comparison

- **Today:** a new Counterparty message type or field requires a new verifier and correct per-field
  guards. Forgetting either is invisible and fails open. Coverage can only be established by audit.
- **Proposed:** a new type requires a packer. Forgetting it is loud (no bytes to compare → explicit
  "cannot verify"). Coverage is mechanically testable against core via `return_only_data`.

## What the industry does (research synthesis)

The structural pattern, across ecosystems, is **conservation accounting over the signed bytes with
default-deny** — one identity instead of N field checks — and the approval screen derived *solely
from the decoded bytes*.

- **Ledger BIP-388 wallet policies** are the gold standard: the device parses the PSBT itself,
  computes amounts and fee from the bytes, and recognizes an output as change **only** if it matches
  a pre-registered descriptor. Everything else displays as an external spend. Change recognition is
  an allowlist; unrecognized means "you are paying this." (https://bips.dev/388/)
- **Simulation** (MetaMask, Rabby, Blowfish/Phantom) is the EVM answer, and is **not available to
  us** — Counterparty state is not computable by a Bitcoin node. It also has documented structural
  weaknesses: TOCTOU (MetaMask states outcomes are "not guaranteed"), simulation-detection
  ("red pill" attack, ZenGo 2023), and — most relevant — **coverage gaps that fail open**: Coinspect
  found Blowfish failed to parse Solana's `assign` instruction, so Phantom displayed only the benign
  part while account *ownership* silently moved to the attacker. That is precisely our disease in a
  different ecosystem.
- **Simulate-then-assert** (Phantom + Lighthouse guard instructions) fixes simulation by making the
  chain revert if actual effects deviate from the preview. Structural, but requires in-transaction
  assertions — Solana has them, Bitcoin L1 does not.
- **Clear-signing metadata** (EIP-712, ERC-7730, Ledger) improves legibility but is *trust-delegated*
  to a registry; the spec itself names malicious metadata as the threat. Not a structural guarantee.
- **Bitcoin PSBT wallets**: no documented incident of a major wallet *displaying a PSBT wrong*; the
  ordinals-era losses were blind-signing and phishing — wallets showing nothing meaningful. Some
  wallets (UniSat) simply refused `SINGLE|ANYONECANPAY` rather than try to display it safely.

No named wallet documents the "re-derive locally and byte-compare" variant, so that part of this
proposal is somewhat novel — but it is exactly what counterparty-core does internally
(`check_transaction_sanity`), which is strong precedent for the same protocol.

## The flaw this research exposes in our design (bigger than the verifier)

**Our approval screen is rendered from the API's echo of the request, not from the transaction.**
`src/pages/compose/send/review.tsx:93-107` displays `result.params.quantity_normalized`,
`result.params.asset` and `result.params.memo` — fields the API chooses. So verification and display
are two independent trust paths, and *any* gap in the verifier is invisible to the user by
construction: the screen shows what the API says it did, not what the transaction does.

This means byte-equality verification alone is not enough, and it reframes the work:

1. **Derive the display from the decoded bytes** (we already have verified unpackers for every type).
   Then what the user sees *is* what the transaction does, and a verifier gap degrades to "machine
   didn't catch it" rather than "user couldn't have seen it."
2. **Byte-equality against a locally-derived expected message** catches substitution mechanically.
3. **Conservation + default-deny**: every satoshi on one side of the identity; any output, sighash,
   or embedded message the decoder cannot fully account for makes the transaction *unsafe to
   present*, not merely warned about.

Those are three independent layers, and (1) is cheap because the unpackers already exist.

## Horizon Wallet (Unspendable Labs) — the only other serious Counterparty wallet

Source reviewed: `github.com/UnspendableLabs/Horizon-Wallet` (Apache-2.0, Flutter/Dart), built by the
team behind counterparty-core.

**Horizon performs no local verification of composed transactions at all.** The flow is
form → remote compose → review screen → sign the returned hex. Specifically:

- Compose is entirely remote (`lib/data/sources/network/api/v2_api.dart` — every `/compose/*`
  endpoint), and `sign_and_broadcast_transaction_usecase.dart` signs `rawtransaction` directly.
  `transaction_service_impl.dart` rebuilds a PSBT from the API's hex and signs **all inputs**,
  copying the API's outputs byte-for-byte without inspecting them.
- There is **no local unpack library**. Even Bitcoin-level decoding is remote
  (`/bitcoin/transactions/decode`), and Counterparty message decoding calls the API's
  `/transactions/unpack`.
- The review screen renders `composeResponse.params` — the API's *echo of the request*
  (`compose_send_page.dart:467-501`). A compromised API could echo correct params and return a
  transaction doing something else; nothing would notice.
- `return_only_data` is not used anywhere.
- Poignant detail: byte-level checks `validateFee()` and `validateBTCAmount()` **exist** in
  `transaction_service_impl.dart` and have **zero call sites**. Someone designed exactly this
  mechanism and never wired it in.
- The dapp PSBT flow is better — the summary is derived from the transaction bytes — but it fails
  open (decode failure leaves the Sign button enabled with an empty summary) and accepts
  **dapp-supplied `sighashTypes` with no wallet-side whitelist**.

**Implications.** (1) There is no prior art to copy for this protocol — this extension is already
further along on verification than the reference wallet written by the protocol's authors. The
whack-a-mole feeling comes from being first, not from being behind. (2) Horizon's choice is
defensible *for them*: Unspendable Labs runs both the wallet and the core API, so the composer is
inside their trust boundary. This extension's verification exists precisely because that assumption
is not made here — which makes the threat model question below the load-bearing one.

## The threat-model question that should be settled first

Everything above is only worth building if a compromised or hostile composer is in scope. That is
currently an explicit premise in the code ("This protects against a compromised API returning
malicious transactions"), and it is a real one if the API endpoint is user-configurable or points at
infrastructure this project does not run. It should be stated once, deliberately, because it decides
how much of this is warranted:

- **If the composer is untrusted** → the layered design below is justified, and deny-by-default is
  the minimum bar.
- **If the composer is trusted** (Horizon's position) → most of `verify.ts` is ceremony, and the
  effort belongs in the dapp-facing PSBT path instead, where the counterparty genuinely is hostile.

The dapp/PSBT surface is untrusted under *either* answer, so work there is unconditionally justified.

## How other Bitcoin wallets handle this

**None of Electrum, Sparrow, BlueWallet, Wasabi, Ledger Live or Trezor Suite accepts a
server-composed transaction.** They construct locally; the server (Electrum/Esplora/Blockbook) is
trusted only for UTXO *discovery*, fee estimates and broadcast — never for authoring. Input amounts
are read out of full previous transactions, not taken from server assertions. Our architecture is
the unusual one.

The two systems that *do* verify another party's composition avoid our failure mode structurally:

- **BitGo** (the closest analog to us: server "prebuild", client `verifyTransaction` before signing —
  `modules/abstract-utxo/src/transaction/fixedScript/verifyTransaction.ts`). It requires every
  intended recipient output to be present, and then **every remaining output to be positively
  classified** — provably-derived change, or a PayGo fee bounded by an explicit threshold. Anything
  unexplained rejects the whole transaction. Note what makes it fail closed: it accounts for the
  *complete output set* rather than checking an enumerated list of fields and ignoring the rest.
- **Wasabi coinjoin** shrinks what a signature authorizes — the client signs only its own inputs, so
  the verification scope is "is my output present with the right amount," and unverified coordinator
  choices cannot hurt it.
- **Lightning BOLT-3** is the purest re-derive-and-compare: both peers build the commitment
  transaction deterministically and independently, and you never accept transaction bytes from the
  counterparty at all — only a signature, checked against the transaction *you* built. Byte-equality
  by construction, failing closed on a single-bit divergence.

### The Trezor 2020 lesson — directly relevant to our fee check

Trezor and Ledger once trusted host-supplied SegWit input amounts, reasoning that BIP-143 makes a
false amount produce an invalid signature — a *cryptographically enforced* check. Saleem Rashid broke
it by mixing signatures across two confirmation rounds, burning funds as fees. The fix was to stop
trusting the host and validate amounts against full previous transactions
(firmware 1.9.1 / 2.3.1).

**We use that exact reasoning today.** `checkTransactionFee` trusts the compose response's
`inputs_values` whenever `signaturesCommitToInputValues` is true (SegWit wallets). The cheap
hardening is to always resolve input values independently — we already have the resolver and already
do this for legacy wallets — and delete the trust assumption rather than reason about whether our
flow is replay-shaped. Worth doing regardless of the larger architecture decision.

## Recommendation

The three patterns converge on the same design, and it is exactly the shape of core's own
`check_transaction_sanity`:

| Layer | Check | Precedent |
|---|---|---|
| Message payload | byte-equality vs locally derived | core's own sanity check; BOLT-3 |
| Outputs | every output positively explained (intended destination, or provable change) or reject | BitGo; Ledger BIP-388 |
| Inputs | source binds first input; values resolved independently, never asserted | Trezor post-2020 |
| Display | derived from decoded bytes, never from the request | Trezor/Ledger WYSIWYS |

Crucially, **the outputs layer does not require local composition** — it is an inversion of the
existing verifier from allow-by-default to deny-by-default, and it is the single cheapest change that
converts the whole class from fail-open to fail-closed. That makes it the right first move even if
local message derivation is never done.

Prototype in this order, stopping to measure after each:

1. Promote `encodeCbor` to `src`, add packers for `enhanced_send` and `issuance` only.
2. Build the CI oracle against `return_only_data` for those two types, across a parameter matrix.
3. If the bytes match core across the matrix, extend to the remaining compose types and add the
   positional destination check; then delete the per-type field verifiers they replace.

The first two steps are small and answer the only question that matters: can we reproduce core's
bytes exactly? If yes, the rest is mechanical. If no, we learn precisely where and why, and keep the
current verifier for those types.
