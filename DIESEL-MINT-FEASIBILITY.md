# DIESEL minting alongside Counterparty transactions

**Feasibility review for Dan — 2026-09-04**

**Status:** source review complete; combined transaction proven on local regtest; base draft wallet
implementation complete; stacked branch implements the measured +26-vB optimization

**Verdict:** **the narrow feature is feasible and implemented behind an off-by-default switch;
keep the PR draft until release-line and live-network acceptance are rechecked**

## Executive verdict

The idea is technically feasible without forcing Counterparty data into bare
multisig. The most credible construction is a transaction containing two
OP_RETURN outputs, with a wallet-owned ordinary output deliberately placed between
them:

```text
[Counterparty destinations, if any]
[Counterparty data OP_RETURN]
[wallet-owned DIESEL UTXO]
[Alkanes runestone OP_RETURN]
[ordinary BTC change, if any]
```

That order is load-bearing. Counterparty reads its data and then stops interpreting
outputs at the first ordinary output. Alkanes independently scans the whole
transaction for `OP_RETURN OP_13`, so it can find the later runestone. Current
Counterparty Core can construct this ordering through `more_outputs`, including a
raw script output. This is now both a source-level conclusion and a successful
local-regtest result, but not an end-to-end mainnet proof. See the current [Counterparty composer](https://github.com/CounterpartyXCP/counterparty-core/blob/67e10db3ee266068c1effc4e83653df39ace5ca8/counterparty-core/counterpartycore/lib/api/composer.py)
and [Rust transaction parser](https://github.com/CounterpartyXCP/counterparty-core/blob/67e10db3ee266068c1effc4e83653df39ace5ca8/counterparty-rs/src/indexer/bitcoin_client.rs).

The best construction depends on the host transaction:

- A plain BTC send can put the runestone before ordinary change and mint to that
  change in one compose: +26 vB.
- An OP_RETURN Counterparty transaction should use two composes with identical
  selected inputs. In the second, the explicit parser-boundary UTXO absorbs all
  change, leaving `XCP data -> UTXO -> runestone`: also +26 vB.
- If exact recomposition is unavailable, use a separate 330-sat UTXO and normal
  change: +57 vB.
- Never add a 330-sat UTXO as an otherwise-unneeded input merely to reuse it:
  that makes the delta about 125 vB, almost the 135-vB standalone mint.

Terminology in this document is literal: a **DIESEL UTXO** is an ordinary Bitcoin UTXO whose
outpoint also has a DIESEL balance in the Alkanes index. It is not a special Bitcoin output type.
The same physical UTXO cannot be reused after it is spent; “reuse” means spending it and routing
its old balance plus the new mint to a successor UTXO.

The PR should remain a draft for two reasons:

1. Alkanes balance discovery, UTXO protection, exact mint-output verification, and an explicit
   edict send now exist in the branch, but the address index and send still need a live integration
   fixture before release. An indexer outage fails closed for UTXO spending.
2. An unreleased Alkanes staging branch dated 2026-09-01 proposes activating DIESEL v3 at
   height **966,000**. The current height supplied after this review is
   **965,504**—only 496 blocks short (roughly 3.4 days at ten-minute blocks). In
   that proposal, a bare opcode-77 mint does
   **not** pay the caller; it accrues to a governance-controlled treasury unless a
   mint gate is invoked. It is not current released consensus, but it makes
   building against today's economics irresponsible. Pull request 305 was merged
   into `tmp_gate`, not into the `main` release line; the activation and a later
   fixed-payout change remain absent from the mainnet release as of this review.
   See the [staging v3 commit](https://github.com/kungfuflex/alkanes-rs/commit/09e25f6ae67c830b04bed2adae39f41956249b7a).

## What this draft PR implements

The base PR carries the complete narrow vertical slice:

- a dependency-free DIESEL mint protostone builder and strict decoder, pinned against both the
  canonical pointer-0 script and the pointer/refund-1 script used by the regtest proof;
- exact, string-preserving Alkanes outpoint reads through the protocol-1
  `alkanes_protorunesbyoutpoint` method, with unknown response shapes treated as failures;
- an off-by-default **Mine DIESEL (Experimental)** advanced setting that permanently enables
  UTXO protection when first switched on, plus a user-editable fee-rate ceiling on the dedicated
  DIESEL page. The default ceiling is 2 sat/vB; above it the host transaction proceeds unchanged;
- shared raw-transaction and PSBT provider analysis that blocks a signed Alkanes UTXO, and
  fails closed if UTXO status cannot be established;
- Counterparty coin selection that excludes positive and unknown Alkanes outpoints, and disables
  the existing server-selected-input fallback while protection is active;
- the same protection for explicit UTXO Counterparty operations such as detach and move.
- automatic decoration of eligible BTC sends, enhanced Counterparty sends (including memos and
  caller outputs), and current-form UTXO attaches, followed by byte-level proof of the DIESEL UTXO
  and runestone;
- a separate address-level `DIESEL · Alkanes` balance and UTXO detail surface; and
- a protocol-native DIESEL send flow that deliberately selects UTXO inputs, allocates the exact
  recipient amount with an edict, returns every leftover unit to an owned UTXO, and verifies the
  finished input/output layout before signing.

The stacked `feature/diesel-optimized-utxo` branch adds the two-pass +26-vB construction:

- first compose the already-safe 330-sat UTXO plus runestone shape against a locally selected,
  asset-filtered input set;
- parse the first transaction to learn the exact subset of inputs and require the narrow
  `host output -> DIESEL UTXO -> runestone -> owned standard change` shape;
- recompose with those exact inputs, `use_all_inputs_set=true`, an exact fee, and the full wallet
  return value in the UTXO, eliminating the redundant 31-vB change output;
- independently reconcile the final fee from the locally selected input values and parsed output
  values, and require unchanged host bytes, three exact outputs, the same input set, zero residual
  change, and the predicted signed vsize before returning the optimized transaction; and
- retain the verified explicit-output first compose whenever no ordinary change output can safely
  be absorbed. Its cost is 26 vB plus the actual wallet output size. Unsupported shapes are not
  guessed; and
- prefer one confirmed, pure-DIESEL UTXO as the sole funding input when it can fund the
  transaction by itself. This rolls accumulated DIESEL into the successor UTXO without adding
  an input. If it cannot fund the transaction, it remains protected and clean BTC is used instead;
  the wallet never pays roughly 68 vB just to consolidate during a mint; and
- after a successful broadcast, remember the exact verified successor in memory and roll it through
  a dependency chain of at most 25 unconfirmed transactions. At the ceiling, leave that tip
  protected and use clean BTC for a temporary second lineage when the host transaction should not
  wait. On restart or proof expiry, never infer unconfirmed Alkanes state.

The current allow-list supports P2WPKH, P2TR, P2PKH, and wallet P2SH sources. It skips MPMA,
Counterparty Taproot/multisig *message encodings*, legacy attach controls (`utxo_value` or
`destination_vout`), detach/move, and every other unproved transaction family.
The provider surface does not add mints; it only enforces UTXO protection. Swap and Subfrost
unwrap remain research-only and are not presented as available actions.

## Executed validation

The existing DigiRare regtest stack supplied a live Bitcoin Core 30 node and
Counterparty Core v11.3.0 at height 1,647. I used Counterparty's own `compose/send`
endpoint with `encoding=opreturn` and `more_outputs` to construct this exact order:

```text
vout 0  Counterparty enhanced-send OP_RETURN
vout 1  330-sat wallet-owned P2WPKH UTXO
vout 2  Alkanes OP_RETURN OP_13, pointer=1, refund=1, call=[2,0,77]
vout 3  wallet change
```

Bitcoin Core's `testmempoolaccept` accepted the signed transaction at 222 vB and
2 sat/vB. It was then broadcast and mined at regtest height 1,648 as
`2853fdc947bb9f2f8677d3a5d3000b9e3618a0f6d5b5b7ea31caaedcb2027ebe`.
Counterparty indexed it with `supported=true`, `valid=true`, and
`transaction_type=enhanced_send`; the asset debit and recipient credit were both
recorded. Its `utxos_info` selected vout 1 as the first non-OP_RETURN output, which
directly confirms that the UTXO acted as the required parser boundary and the
later Alkanes OP_RETURN did not contaminate the XCP message.

I then measured three composes of the same one-input enhanced send at 2 sat/vB:

| Shape | Signed vsize | Fee | Delta from ordinary send |
|---|---:|---:|---:|
| Ordinary Counterparty send | 165 vB | 330 sats | — |
| 330-sat UTXO + runestone + separate change | 222 vB | 444 sats | +57 vB / +114 sats |
| UTXO absorbs all change + runestone | 191 vB | 382 sats | **+26 vB / +52 sats** |

The optimized 191-vB transaction was signed and accepted by Bitcoin Core 30's
`testmempoolaccept`; it was deliberately not broadcast, leaving its test asset
input available. It used public Counterparty v11.3 compose parameters only:
an exact `inputs_set`, `use_all_inputs_set=true`, `exact_fee=382`, and
`more_outputs` containing the entire 99,618-sat wallet UTXO followed by the
zero-value runestone script. Counterparty therefore had no residual change to
append. The predicted and actual signed sizes were both 191 vB.

The stacked implementation was then rerun end to end on 2026-09-04 against fresh controlled
regtest funds and a newly issued indivisible asset, `A95428956669999001`. The extension algorithm
produced, signed, broadcast, and mined the optimized transaction
`3a930995f7eac57afa17dd39424836cf64c06e35921dd9021234f8948cbe31f7`:

- Bitcoin Core 30 reported exactly **191 vB**, a **382-sat fee**, **2 sat/vB**, and
  `testmempoolaccept.allowed=true`;
- the outputs were the unchanged enhanced-send OP_RETURN, a **1,219,997-sat owned P2WPKH
  UTXO**, and the exact pointer/refund-1 DIESEL runestone, with no separate change;
- Counterparty Core 11.3 indexed it as `supported=true`, `valid=true`,
  `transaction_type=enhanced_send`, selected vout 1 as the parser boundary, debited exactly one
  unit from the source, and credited exactly one unit to the intended destination; and
- balances reconciled to 999 units at the source and 1 at the destination.

A plain 10,000-sat BTC send spending that UTXO was also recomposed into the same three-output
shape. It signed at **167 vB**, paid **334 sats** at 2 sat/vB, and passed
`testmempoolaccept`. This proves the wallet can use the previous UTXO as the funding input and
route its existing DIESEL plus the new mint into vout 1 without an added input. The full Alkanes
balance rollover remains covered by the consensus-indexer WASM regression below because the
DigiRare Docker stack contains Bitcoin and Counterparty indexers but no Alkanes indexer.

This changes the implementation conclusion materially: **the +26-vB case is
reachable today without a Counterparty Core patch and without rewriting a PSBT.**
It needs a two-pass compose in the extension, described below.

Separately, I added and ran a focused Alkanes consensus-indexer WASM regression
using the same three-output protocol shape. Mint 1 created UTXO A. Mint 2 spent
A and targeted successor B while a control mint measured mint 2's reward. The test
asserted that A was cleared and `B == old balance + new reward`; it passed. This is
direct proof of the rolling-UTXO behavior in the released source, not merely a
read of the mint contract.

These are two strong, complementary tests, but they are not yet one identical raw
transaction fed through both full indexers. The DigiRare Docker stack has no
Alkanes indexer, so a same-bytes dual-indexer fixture remains an acceptance gate.

I also exercised the optimized host shape from every ordinary single-key address family the
extension supports. Each transaction was signed by Bitcoin Core, accepted by
`testmempoolaccept`, mined, and indexed by Counterparty 11.3 as a supported, valid enhanced send:

| Source type | Transaction | Actual signed vsize | Fee |
|---|---|---:|---:|
| P2WPKH | `3a930995f7eac57afa17dd39424836cf64c06e35921dd9021234f8948cbe31f7` | 191 vB | 382 sats |
| P2TR key path | `db268f208b2ef2df5bd40090e3e576505b848f190fed85b14b0eff615eedcacb` | 192 vB | 386 sats |
| P2PKH | `455f65c9e91f107c8cdde3978caa0660550e88fb9365239b0036a034f8a01d38` | 272 vB | 546 sats |
| P2SH-P2WPKH | `0d160ca590a8e4405b411b261f14cfb5cc10057f16c2c9402a2dc558cec8d473` | 215 vB | 624 sats |

The nested-SegWit fee is intentionally reported, not normalized away: Counterparty 11.3 estimated
312 vB while the signature was actually 215 vB. That format works, but the upstream estimator
overpays its absolute fee. The mint-only difference remains 26 vB because the estimator's input
bias is present in both the ordinary and minting composes.

The default UTXO-attach shape is proven too. Transaction
`569afa1d9a2b295bf965753ba670886006a7b889bb7c18e113cf9af8dcc42157` was signed at **208 vB**
and **416 sats**, accepted, mined, and indexed as `transaction_type=attach`, `supported=true`, and
`valid=true`. Counterparty assigned the test asset to vout 0; the wallet-owned DIESEL UTXO was
vout 2; the runestone was vout 3. The ordinary attach was 182 vB / 364 sats, making the measured
increment exactly **26 vB / 52 sats**.

A tempting still-smaller-looking layout was rejected by the actual parser. Putting the Alkanes
OP_RETURN immediately after Counterparty's OP_RETURN made both send and attach composition fail
with `Encountered invalid OP_RETURN script`. The intervening ordinary wallet output is therefore
a required Counterparty parser boundary, not gratuitous storage output.

## Audit of the supplied write-up

| Claim | Finding |
|---|---|
| The fixed hex decodes to protocol 1, pointer 0, refund 0, message `[2,0,77]` | **Correct.** The decode matches Alkanes tags. |
| A special UTXO is required to mint | **Wrong.** A fresh mint needs no incoming Alkanes. A UTXO is a wallet strategy for holding or rolling the result. |
| The live DIESEL contract is unknown | **Wrong for the released indexer.** Mainnet switches `2:0` to upgraded-EOA at height 917,888. |
| Opcode 77 might differ | **Wrong for released code.** `#[opcode(77)] Mint` is explicit. |
| P2SH is a current Counterparty compose choice | **Wrong.** Compose support was removed; only historical parsing remains. |
| Counterparty Taproot cleanly replaces OP_RETURN | **Misleading.** It is a commit/reveal witness envelope and rejects explicit destinations and UTXO sources. |
| P2WPKH is correctness-required for DIESEL | **Wrong.** A wallet-controlled P2TR output can carry the indexed balance. P2WPKH is merely slightly cheaper over create-and-spend. |
| An XCP send normally puts the recipient at vout 0 | **Usually wrong for enhanced asset sends.** Their destination is in the message, and vout 0 is commonly data. |
| Two OP_RETURNs are speculative | **Outdated.** Bitcoin Core 30 permits them by default, and the exact construction passed `testmempoolaccept` and mined in the DigiRare regtest stack. Production relay paths still need testing. |
| Marginal cost is always ~26 vB / 5× cheaper | **Overstated.** That is an optimized best case, not the straightforward safe integration. |

Counterparty v11's release notes confirm Taproot envelope support and removal of
P2SH compose support. [Counterparty Core v11.0.0](https://github.com/CounterpartyXCP/counterparty-core/releases/tag/v11.0.0)

## UTXO model and the real safety problem

Minting itself needs no prior DIESEL outpoint. The protostone calls Alkane `2:0`,
opcode `77`, and assigns the result to the output selected by `ProtoPointer`.

“Add DIESEL to the same UTXO over and over” is shorthand, not literal Bitcoin
behavior. An outpoint can be spent only once. The implementable sequence is:

```text
UTXO A (old DIESEL) -> spend A in mint 2 -> UTXO B (old + mint 2)
UTXO B              -> spend B in mint 3 -> UTXO C (old + mint 2 + mint 3)
```

The focused Alkanes WASM regression in this review proved exactly the first line.

Once DIESEL is on an outpoint, however, that outpoint is an asset-bearing coin.
When spent, Alkanes loads its balance, routes it according to the transaction, and
clears the consumed input. Without a valid runestone, the balance is effectively
lost. This is explicit in the released
[protorune indexer](https://github.com/kungfuflex/alkanes-rs/blob/v2.2.1-rc.4/crates/protorune/src/lib.rs).

Two designs are possible:

- **Rolling UTXO:** spend the previous UTXO and route old plus newly minted
  DIESEL to its replacement. This keeps one asset UTXO but may add an input.
- **Accumulating UTXOs:** mint to a fresh output and leave older ones untouched.
  This avoids the recurring input but fragments the balance and creates a growing
  protected UTXO set.

The Counterparty API does have both `exclude_utxos_with_balances` and
`exclude_utxos`, but only the second one is directly useful here:

- `exclude_utxos_with_balances=true` queries Counterparty Core's own `balances`
  table. DIESEL is not in that table, so its UTXO looks like ordinary BTC.
- `exclude_utxos=<txid:vout,...>` excludes exact client-supplied outpoints. The
  extension should pass every known Alkanes-bearing outpoint here as a second line
  of defence whenever it is not deliberately rolling one.
- `inputs_set` is still the primary control. The extension already selects inputs
  locally, but its last-resort retry removes `inputs_set` and lets Core choose.
  Therefore local filtering alone is insufficient; `exclude_utxos` must survive
  every retry, and the unsigned transaction must be checked again before signing.

This is not only a BTC-send problem. BTC sends, ordinary XCP sends, orders,
issuances, broadcasts, dispensers, dApp requests, and consolidation can all consume
BTC funding inputs. Every transaction path must obey the same global protected-UTXO
policy. UTXO-addressed attach/detach/move flows must additionally reject a DIESEL
UTXO as their explicit source unless they implement valid Alkanes routing.

The Alkanes CLI independently implements a fail-closed `lock_alkanes` check using
`protorunesbyoutpoint`; that supports this design. Counterparty Core should not be
made to query a separate Alkanes indexer. Keep the cross-protocol knowledge in the
wallet and use Core's generic exact-outpoint exclusion.

### What the “special UTXO” should actually be

A fixed 330-sat UTXO spent and recreated on every transaction is the wrong
optimization. Its input is almost always additional, taking the marginal cost from
57 vB to roughly 125 vB—nearly the 135 vB standalone mint. Making it Taproot does
not rescue that arithmetic.

The best design is a **same-address active funding/change coin**:

1. When minting is attached, deliberately include the current UTXO as a funding
   input, route its existing DIESEL plus the new reward to the wallet's next normal
   change output, and mark that output as the successor.
2. When minting is not attached or is unsafe, exclude every UTXO both from the
   local candidate set and through Core's exact `exclude_utxos` parameter.
3. If the transaction has no viable wallet change output, either create a UTXO
   explicitly and disclose the added 31 vB, or skip the mint. Never improvise after
   composition.

This works economically only when the UTXO input replaces BTC funding the
transaction already needed. A fixed-value reserve that is recreated unchanged is
still an extra input even if it contains many sats.

There are three practical implementation levels:

- **One-pass/simple:** request a 330-sat same-address UTXO and the Alkanes script
  through `more_outputs`, allowing Core to append ordinary change. This is
  parser-safe and costs 57 vB. Treat the result as a new protected shard; do not
  force an old UTXO input into the transaction just to consolidate it.
- **Two-pass/optimized with current Core:** first compose the 57-vB shape to freeze
  the actual inputs, output order, data size, and signed-size estimate. Recompose
  with only those inputs, `use_all_inputs_set=true`, an `exact_fee`, and a UTXO
  value equal to every sat that would otherwise be change. Core then appends no
  change output. This measured **+26 vB** and leaves Core—not the extension—building
  both the raw transaction and PSBT.
- **Core API improvement:** a future `more_outputs_after_change`-style facility could
  express the same shape in one request. This is cleaner for latency and public API
  ergonomics, but no longer a prerequisite for the efficient implementation.

Do not mutate the first response's raw transaction or PSBT. Although deleting the
separate change output and merging its value into the UTXO would also produce a
191-vB skeleton, it would leave the original 444-sat fee in the measured example—an
accidental 2.32 sat/vB instead of the selected 2 sat/vB—and would require faithfully
rewriting every hardware-wallet PSBT field.

Keep the UTXO on the same active address for the first version. Counterparty uses
the source/first-input relationship as a sanity check and its selector reorders
inputs by value. A dedicated derivation-path address introduces mixed-key signing
and first-input ambiguity without improving the protocol.

### UTXO state, not just a stored outpoint

Maintain one state machine per wallet address:

```text
confirmed UTXO -> pending successor -> confirmed successor
```

Store the outpoint, sat value, DIESEL amount, script/address, creating transaction,
and confirmation state. The existing pending-change cache must not classify the
successor as ordinary spendable BTC. RBF replacement and reorgs must atomically
replace or roll back this state.

The wallet may chain from an unconfirmed successor only when it can prove that successor came
from its own successfully broadcast, byte-verified DIESEL transaction. It keeps this trust record
in memory and rolls the tip through at most 25 unconfirmed transactions. If another real
transaction proceeds before confirmation, it starts a temporary lineage from clean BTC rather
than extending the capped tip or blocking the user. Unknown unconfirmed outputs are never inferred
to be safe from an indexer absence. A restart or 30-minute expiry discards the optimistic record
and pauses that lineage until the output confirms and an indexer proves its assets.

Do not fee-bump a parent after descendants have been broadcast: replacing it changes the txid and
invalidates every child. A bulk scheduler should either finalize the chain's fee before adding
children or replace the entire suffix as one explicit operation. The current implementation takes
the conservative path and does not automatically replace a parent chain.

## Bare multisig and Taproot

| Encoding design | Works mechanically? | Fee/simplicity judgment |
|---|---|---|
| XCP OP_RETURN, own output, Alkanes OP_RETURN | Yes; mined and CP-indexed locally | **Winner** |
| Adjacent XCP and Alkanes OP_RETURNs | Bitcoin accepts it; Counterparty does not | Reject |
| Combine both payloads in one OP_RETURN | No; their script/prefix requirements conflict | Impossible |
| Bare-multisig XCP + Alkanes OP_RETURN | Plausible for historical/current parser | Larger, burns dust, unnecessary |
| P2SH XCP + Alkanes OP_RETURN | Historical parse only | Composer support removed |
| Taproot XCP + Alkanes | Commit/reveal, not one simple host transaction | Too complex for MVP |
| Modify composed raw tx/PSBT locally | Possible | Avoid; two-pass recompose is safer |

Bare multisig is not required for short XCP messages. Keep Counterparty in its
normal OP_RETURN encoding and add a second OP_RETURN for Alkanes. If a long XCP
message makes `auto` fall back to multisig, a first version can simply skip DIESEL.

“Taproot” means two different things here:

- A **P2TR UTXO output** is feasible. It is just a wallet-controlled output to
  which Alkanes assigns a balance.
- Counterparty **`encoding=taproot`** creates an ephemeral P2TR commit plus a
  separately signed reveal whose witness carries the message. It is not a simple
  data-output choice.

Counterparty Taproot is a poor MVP host. Core signs the reveal with its ephemeral
key, so safely modifying reveal outputs means rebuilding that flow in the extension
or changing Core. The reveal still contains a Counterparty marker OP_RETURN, so it
does not avoid the two-OP_RETURN issue. Exclude it initially.

Thus Taproot is valid for the token-bearing UTXO, but offers no useful advantage as
the Counterparty message encoding. P2WPKH is marginally smaller for a repeatedly
created-and-spent UTXO; that is economics, not correctness.

Address eligibility should be based on the wallet's ability to own and sign the
UTXO, not on the recipient's address format:

| Wallet/UTXO script | Protocol support | Initial policy |
|---|---|---|
| P2WPKH | Yes | Preferred; smallest proven repeated create/spend shape |
| P2TR key path | Yes | Allowed and regtest-proven; slightly larger UTXO lifetime cost |
| P2SH-P2WPKH | Yes | Allowed and regtest-proven; upstream size estimator currently overpays |
| P2PKH, including legacy derivation variants | Yes | Allowed and regtest-proven; higher fee and variable DER-signature sizing |
| Arbitrary P2WSH/P2SH multisig, script-path P2TR, descriptor/watch-only | Not inherently forbidden by Alkanes | Skip until ownership, PSBT, and recovery policies exist |

A P2TR source does not imply Counterparty Taproot encoding. Force OP_RETURN for an
eligible short Counterparty message even when the funding/UTXO address is P2TR.
For a DIESEL transfer, any standard recipient output can be targeted by vout; the
extension only needs an address format it can decode and a wallet-owned standard
output for change/refund. Never route a balance to OP_RETURN, bare-multisig data,
an unknown script, or a dApp-provided output merely because it is spendable under
Bitcoin consensus.

## Output order and relay

Counterparty treats an unfamiliar OP_RETURN encountered during its data scan as
invalid. The Alkanes output therefore cannot simply precede or sit directly after
Counterparty data. A wallet output after the XCP message acts as the parser boundary:

```text
XCP data -> wallet UTXO -> Alkanes OP_RETURN
            ^ Counterparty stops here
```

Alkanes scans outputs for `OP_RETURN OP_13`, so it can still find the later
runestone. One implementation smell needs a dedicated test: its helper for the
runestone output index currently returns the first OP_RETURN, not the first matching
runestone. That value is unused by the pure-mint path today, but an upstream fix
would make the composition less brittle.

Multiple OP_RETURNs are consensus-valid. Bitcoin Core 30 also permits them under
default relay/mining policy and applies its aggregate OP_RETURN-size limit.
[Bitcoin Core 30 release notes](https://github.com/bitcoin/bitcoin/blob/master/doc/release-notes/release-notes-30.0.md)

The exact signed combined transaction passed `testmempoolaccept` on the DigiRare
Bitcoin Core 30 node, then mined normally. Counterparty v11.3.0 parsed it as a valid
enhanced send after confirmation.

Older Core and alternative/custom policies may still reject them. The extension
uses several broadcast fallbacks, so every production path must still be tested.
This should fail before signing when the configured broadcaster cannot relay the
transaction.

## Realistic fee delta

For small pointer/refund indices, the runestone script remains 17 bytes and its
output costs about 26 vB including amount and length fields.

| Construction | Approximate marginal vsize |
|---|---:|
| Runestone targeting an already-existing, correctly positioned own output | **26 vB** |
| Straightforward current-Core path: P2WPKH UTXO + runestone | **57 vB** |
| Same, plus an otherwise-unneeded P2WPKH UTXO input | **125 vB** |
| Supplied bot's standalone P2WPKH mint | **135 vB** |

The “5× cheaper” claim describes the optimized first row. It is now measured, not
merely theoretical, but it remains conditional: the transaction must have enough
wallet-returning value to act as the UTXO, and using an old UTXO must not add
an otherwise-unneeded input. The 57-vB path is the simplicity fallback. If rolling
a UTXO adds an input, the advantage nearly disappears.

Miner-fee deltas at representative rates are:

| Fee rate | +26 vB optimized | +57 vB simple | +125 vB forced roll | 135-vB standalone |
|---:|---:|---:|---:|---:|
| 1 sat/vB | 26 sats | 57 sats | 125 sats | 135 sats |
| 2 sat/vB | 52 sats | 114 sats | 250 sats | 270 sats |
| 5 sat/vB | 130 sats | 285 sats | 625 sats | 675 sats |
| 10 sat/vB | 260 sats | 570 sats | 1,250 sats | 1,350 sats |
| 20 sat/vB | 520 sats | 1,140 sats | 2,500 sats | 2,700 sats |
| 50 sat/vB | 1,300 sats | 2,850 sats | 6,250 sats | 6,750 sats |
| 100 sat/vB | 2,600 sats | 5,700 sats | 12,500 sats | 13,500 sats |

The UTXO's BTC value is **not a fee**. It remains wallet-owned, but becomes
protocol-encumbered and must be excluded or safely rolled thereafter. A 330-sat
UTXO minimizes locked liquidity; a normal-change UTXO is more useful because
it can fund a later transaction without adding another input. The cost of the latter
is operational liquidity and linkability, not destroyed BTC.

## Unit economics: price the mint-only delta

The host transaction is the reason the user opened the wallet. Its baseline fee is
therefore not attributable to DIESEL. The mining decision compares the value of the
incremental reward with only the transaction bytes added by mining:

```text
host fee                 = host_vbytes * fee_rate
incremental mining fee   = delta_vbytes * fee_rate
expected DIESEL value    = success_probability * reward_per_mint * executable_exit_price
expected net value       = expected DIESEL value
                           - incremental mining fee
                           - allocated future exit cost
```

For example, the measured ordinary enhanced send is 165 vB. At 2 sat/vB it costs
330 sats whether or not DIESEL exists. The implemented 57-vB attachment makes the
combined transaction 222 vB and the total fee 444 sats. The economically relevant
mining cost is **114 sats**, not 444 sats. An optimized 26-vB attachment would cost
only 52 additional sats at that rate.

The new 330-sat storage output is also not part of that miner fee. Those sats remain
owned by the wallet. They are temporarily unavailable to ordinary coin selection,
and repeated fresh UTXOs create a growing liquidity reserve and a future
consolidation cost, but they are not burned. The UI must show these separately:

- **extra miner fee**: spent permanently;
- **protected storage**: still wallet-owned and recoverable when DIESEL is moved;
- **future exit cost**: swap/unwrap fees, slippage, and the Bitcoin fee needed to
  move or consolidate the token-bearing outputs.

### Break-even DIESEL price

Let:

- `d` be marginal vbytes (26 optimized, 57 implemented, 125 forced roll, or 135
  standalone);
- `f` be the selected Bitcoin fee rate in sat/vB;
- `N` be the runtime's counted DIESEL-mint transactions in the confirming block,
  including this transaction even if another counted call later reverts;
- `B` be that block's effective DIESEL mint pot;
- `p` be this call's probability of succeeding; and
- `x` be the expected future exit/consolidation cost allocated to this mint in sats.

The expected reward is `B / N` DIESEL. If an executable exit quote is `q` sats per
DIESEL, the skeptical break-even test is:

```text
p * (B / N) * q > d * f + x

q_break_even = (d * f + x) * N / (p * B)
```

Under the released upgraded-EOA source, `B` can range from 3.125 down to 1.5625 as
the block-fee haircut rises to its cap. Ignoring failures and future exit costs only
to expose the byte-size effect, the fee-only break-even coefficients are:

| Construction | Full 3.125 pot | 50% haircut, 1.5625 pot |
|---|---:|---:|
| +26 vB optimized | `8.32 * f * N` sats/DIESEL | `16.64 * f * N` sats/DIESEL |
| +57 vB implemented | `18.24 * f * N` sats/DIESEL | `36.48 * f * N` sats/DIESEL |
| +125 vB forced roll | `40.00 * f * N` sats/DIESEL | `80.00 * f * N` sats/DIESEL |
| 135-vB standalone | `43.20 * f * N` sats/DIESEL | `86.40 * f * N` sats/DIESEL |

At 2 sat/vB and `N = 100`, for example, the implemented path would need an
executable price above **3,648 sats/DIESEL** with the full pot, or **7,296
sats/DIESEL** at the maximum haircut, before failure risk and exit costs. Actual
recent `N` was much higher, as the next section shows.

### Observed mainnet reward per transaction

The public Subfrost trace data answers the user's “is it 0.01, 0.1, 1, or 100?”
question directly. For each block from 965,399 through 965,418, I decoded every
root EOA call to alkane `2:0` with opcode `77`, classified the final trace response,
and calculated newly returned DIESEL as outgoing `2:0` value minus incoming `2:0`
value. Sample transaction IDs were independently checked against Bitcoin block
height.

| Height | Counted mint txs (`N`) | Successful | Failed | DIESEL per successful tx |
|---:|---:|---:|---:|---:|
| 965,399 | 4,891 | 4,891 | 0 | 0.00063697 |
| 965,400 | 3,837 | 3,837 | 0 | 0.00081073 |
| 965,401 | 6,555 | 6,555 | 0 | 0.00047610 |
| 965,402 | 6,258 | 6,258 | 0 | 0.00049837 |
| 965,403 | 1,402 | 1,402 | 0 | 0.00221047 |
| 965,404 | 2,925 | 2,925 | 0 | 0.00106480 |
| 965,405 | 1,538 | 1,538 | 0 | 0.00201356 |
| 965,406 | 3,323 | 3,323 | 0 | 0.00093782 |
| 965,407 | 4,279 | 4,279 | 0 | 0.00072754 |
| 965,408 | 6,125 | 6,125 | 0 | 0.00050945 |
| 965,409 | 2,209 | 2,209 | 0 | 0.00140680 |
| 965,410 | 5,567 | 5,567 | 0 | 0.00055970 |
| 965,411 | 4,413 | 4,413 | 0 | 0.00070552 |
| 965,412 | 857 | 856 | 1 | 0.00361880 |
| 965,413 | 1,761 | 1,760 | 1 | 0.00176410 |
| 965,414 | 3,219 | 3,219 | 0 | 0.00096695 |
| 965,415 | 2,097 | 2,096 | 1 | 0.00148157 |
| 965,416 | 3,627 | 3,627 | 0 | 0.00085828 |
| 965,417 | 1,209 | 1,209 | 0 | 0.00256859 |
| 965,418 | 1,253 | 1,246 | 7 | 0.00246707 |

Across these 20 blocks there were 67,345 counted mint transactions, 67,335
successful and 10 failed. `N` ranged from 857 to 6,555 (median 3,271). Reward per
successful transaction ranged from **0.00047610 to 0.00361880 DIESEL**, with median
**0.000952385** and arithmetic mean **0.0013141595 DIESEL**. So the practical order
of magnitude in this window was roughly **one-thousandth of one DIESEL per tx**.
The seven failures at height 965,418 explicitly reverted with “all fuel consumed by
WebAssembly”; they still paid Bitcoin fees and produced no DIESEL.

The user's referenced height 965,504 was materially quieter: 251 counted calls, all
successful, each receiving **0.01216764 DIESEL**. Block 965,522 was quieter again:
154 successful calls at **0.01974508 DIESEL** each. Reward is therefore highly
non-stationary; a 20-block dashboard is a description of recent competition, not a
forward quote.

The 20-block rewards imply effective distributed pots from about 3.0912 to 3.1208
DIESEL, only a 0.13%-1.08% realized haircut from 3.125 in that particular window.
The source's 50% cap remains a stress case, not what these blocks experienced.

Using the report's separate, unexecuted pathfinder sample of 56,252 frBTC base units
for 1 DIESEL only as a gross-value scenario, those rewards were worth approximately
27-204 sats, with a 54-sat median and 74-sat mean. Before failures, slippage, swap,
unwrap, and consolidation costs:

| Construction and rate | Blocks with gross reward above marginal fee |
|---|---:|
| Implemented +57 vB at 1 sat/vB | 9 / 20 |
| Implemented +57 vB at 2 sat/vB | 4 / 20 |
| Optimized +26 vB at 1 sat/vB | 20 / 20 |
| Optimized +26 vB at 2 sat/vB | 11 / 20 |
| Standalone 135 vB at 1 sat/vB | 3 / 20 |
| Standalone 135 vB at 2 sat/vB | 0 / 20 |

This is the strongest economic argument for pursuing the +26-vB design and against
calling the current +57-vB path automatically profitable. It is not evidence that
the sampled quote can be executed or converted to BTC.

One API trap was caught during this analysis: querying historical `traceblock` with
the third `metashrew_view` block tag left at `latest` returned the same latest block
for every requested height. Historical analytics must bind both the protobuf height
and the view's block tag to the requested height, then cross-check transaction block
membership. The wallet should not consume the ergonomic convenience call for Pulse.

If prices are displayed in dollars and Bitcoin's price is `P_BTC_USD`, convert with:

```text
q_sats_per_DIESEL = P_DIESEL_USD * 100,000,000 / P_BTC_USD
P_DIESEL_break_even_USD = q_break_even * P_BTC_USD / 100,000,000
```

BTC/USD therefore changes the dollar presentation, but it does not independently
change a comparison already denominated in sats. If DIESEL's executable sat price
stays constant, a higher BTC/USD price raises the dollar value of both the token and
the Bitcoin fee together.

### What “market price” and “mining cost” must mean

A pool reserve ratio or last trade is not enough to establish realizable value. The
price input must be a timestamped **executable net exit quote** for a stated amount,
including pool fee, price impact, route liquidity, frBTC unwrap assumptions, and any
fixed Bitcoin transaction cost. Until that exit has been proven, the UI should say
that economics are unavailable rather than showing a green profit number.

Likewise, a historical “mint cost” should be computed per block as:

```text
incremental miner fee for the selected construction / actual reward per successful mint
```

It must disclose the construction (`+26`, `+57`, or another measured delta), the fee
rate convention, deployed reward adapter, failures/reverts, and whether exit costs
are included. A failed mint has no finite cost per DIESEL; hiding failures from the
average makes the chart optimistic.

The proposed **DIESEL Pulse** is useful if it surfaces these inputs rather than
collapsing them into one seductive number:

| Pulse field | Defensible definition |
|---|---|
| Market / exit price | Net executable sats per DIESEL for a stated sell size and verified route |
| Extra fee now | Exact mint-only vbytes and sats for this transaction |
| Protected storage | 330 sats (or actual UTXO value), explicitly labelled recoverable |
| Projected reward | A range derived from recent `N` and the active reward formula, never a promise |
| Break-even band | Sats/DIESEL after marginal fee, failure rate, and allocated exit cost |
| Recent history | Median and range with reverts visible; adapter version and timestamp shown |

The button in the mock-up should not say “Mine ~38.9k sats” unless 38.9k is clearly
labelled as a probabilistic reward estimate and its assumptions are shown. A safer
transaction-review treatment is **“DIESEL mint included · +57 vB / +114 sats at
2 sat/vB”**, followed separately by **“330 sats protected storage; remains yours.”**
The current market and reward data are not yet trustworthy enough for the extension
to auto-label a mint profitable.

### Automatic mining policy

The safe automatic gate uses facts known before signing:

```text
mint enabled AND supported shape AND host fee rate <= user's ceiling
```

The dedicated DIESEL page exposes that ceiling and translates it into both known marginal shapes.
At the default 2 sat/vB, +26 vB costs about 52 sats and the +57-vB fallback costs about 114 sats.
When the selected host fee rate exceeds the ceiling, composition skips the mint and proceeds with
the original transaction; the experimental feature must not turn an ordinary payment into an
error merely because mining is unattractive.

A future `Profit-aware` option should be a stricter additional gate, not a replacement for the
fee ceiling. It needs a conservative reward range from recent successful on-chain mints, an
executable DIESEL-to-frBTC quote for the wallet's realizable sell size, the BTC unwrap cost,
slippage, failures, and data freshness. A defensible rule would mine only when the lower-bound net
value exceeds the exact marginal fee by a configurable safety margin. Until all of those inputs are
available, the UI says profitability is unavailable rather than deriving it from a last trade or
pool reserve ratio.

## Design-space comparison

### Balance topology

| Strategy | Fee behavior | State complexity | Main failure mode | Assessment |
|---|---|---|---|---|
| Fixed 330-sat rolling baton | Usually adds ~68-vB input; ~125-vB total delta | Low | Near-standalone cost, serial chain | Reject as default |
| Large active change/funding UTXO | +26 vB when it replaces a funding coin already needed | Medium | Linkability and serial pending state | Best steady-state |
| New UTXO shard per mint | +26 vB with natural UTXO, +57 vB with explicit one | Medium/high | Balance fragmentation | Best fallback |
| Pool of several active UTXOs | Preserves +26 more often under concurrent sends | High | More reconciliation and selection states | Later optimization |
| Standalone mint | ~135 vB | Low and isolated | Highest fee | Useful only as explicit tool |

The economically correct policy is **adaptive**, not “always reuse the special
UTXO”:

1. If a confirmed DIESEL UTXO is already required as a BTC funding input, roll
   it into the new change UTXO.
2. If selecting it would add an input, leave it protected and mint to a new UTXO
   instead.
3. If a normal owned output can become the UTXO, use the +26-vB shape.
4. Otherwise offer the +57-vB explicit output or skip, according to the user's
   maximum marginal fee.
5. Consolidate shards later in a deliberately low-fee transaction; do not pay a
   high current rate merely to keep the UI at “one UTXO.”

This is the same basic trade as ordinary UTXO consolidation. Deferring one extra
P2WPKH input saves about 68 vB at today's rate; combining it later is rational only
at a meaningfully lower fee rate or when a DIESEL send already needs it.

### Bulk attachment: 1,000–2,000 transactions

There are two different throughput targets, and they must not be conflated.

If all 1,000 transactions must sit in the mempool before any confirmation, the default 25-ancestor
limit requires roughly 40 independent chains and leaves roughly 40 DIESEL UTXOs.

If the wallet broadcasts 25, waits for their tip to confirm, then broadcasts the next 25, the
confirmed tip has no unconfirmed ancestors. The policy count resets and transaction 26 can spend
the same lineage:

```text
root -> tx 1 -> ... -> tx 25 -> confirmed tip
                              -> tx 26 -> ... -> tx 50 -> confirmed tip
                              -> ...
                              -> tx 976 -> ... -> tx 1000 -> one final DIESEL UTXO
```

Each transaction spends the preceding wallet UTXO and routes its old DIESEL plus the new reward
to the successor. Therefore a paced 1,000-transaction job can finish with **one DIESEL UTXO** after
40 confirmation rounds; 2,000 takes 80 rounds and can still finish with one. Transactions must be
composed, signed, and successfully broadcast in dependency order. Real use sits between the two
extremes: if the user sends transaction 26 before confirmation, the wallet starts another safe
lineage rather than blocking the real transaction; after confirmation it preferentially continues
an already-open lineage and avoids creating a third.

The number 25 is a mempool policy ceiling, not a promise that 25 transactions will confirm in the
same block. A miner can include a whole chain, a prefix, or none of it. Dependency order guarantees
that child 17 cannot confirm without children 1–16. The conservative implementation waits until the
active tip itself confirms; it does not yet recalculate spare ancestor capacity after only a prefix
confirms. If the local node or broadcast route advertises a lower ancestor limit, the scheduler must
use that lower value.

This was exercised against the repository's live regtest stack. Bitcoin Core accepted 25
unconfirmed combined enhanced-send+DIESEL transactions in one dependency chain and rejected the
26th with `too-long-mempool-chain, too many unconfirmed ancestors [limit: 25]`. Mining one block
confirmed all 25; Counterparty indexed every member as a supported, valid enhanced send:

- first child: `bffd0f9fa2d94c0f8ce42c8ce16e259fb6132a04b5e976bc04f383f986087f5c`;
- 25th tip: `4c155b94342519760422b4bae94c33a2a39c4b2d826ec748e4b0b84b2ca7fa2b`;
- block 2,358: `600a8bf9e34958e426dfe4e90eb0d34b6d70a41351df670567fb2a5c78fdc8a4`.

Confirmation-paced chaining solves future fragmentation but does **not** improve the per-mint
reward or avoid
self-dilution. If 1,000 of our mints confirm in one block with `N_other` other successful mints and
effective pot `B`, their combined reward remains `B * 1000 / (N_other + 1000)`. It also does not
make the host transaction free: every chain root must contain enough BTC for all descendant host
outputs and miner fees. The root needs enough BTC for the current 25-transaction round; after
confirmation its reduced value continues into the next round. Across the whole job it must still
cover every recipient/attach output and fee.

The wallet therefore applies these rules:

1. Use a confirmed, sufficiently funded pure-DIESEL UTXO as a root when available; otherwise use
   clean BTC and make the returned wallet value the new root.
2. Reuse only a pending tip that this wallet just built, verified, and successfully broadcast.
3. At 25 unconfirmed transactions, never extend that tip. If the user continues, start from clean
   BTC; if they wait, resume the next round from the same confirmed UTXO. Never double-spend a root
   to manufacture parallel branches.
4. Forget pending trust on restart/expiry and wait for confirmation/indexing. This can pause a
   batch, but cannot expose DIESEL to an ordinary spend.
5. Do not automatically RBF a chain parent after children exist. Partial broadcast failure leaves
   the last accepted tip protected and the remaining work resumable.

Without chaining, later spending 1,000 P2WPKH shards would contribute about 68,000 vB of inputs.
The paced design leaves one tip and avoids that fragmentation entirely. The on-the-way mint still
adds the same measured 26 vB to every optimized host transaction.

### Recommended two-pass compose

For a short OP_RETURN-encoded Counterparty message:

1. Locally select spendable BTC coins after subtracting every known Counterparty
   and Alkanes UTXO. Add one UTXO only when it is deliberately being rolled.
2. First compose with a 330-sat wallet output followed by a dynamically encoded
   DIESEL runestone. This establishes the exact Counterparty output shape and the
   inputs Core actually chose.
3. Parse that unsigned transaction locally. Resolve each selected prevout from a
   trusted source, identify Core's ordinary change, and compute the no-change signed
   size by removing that output's serialized size from Core's signed-size estimate.
4. Set `exact_fee = ceil(target_rate × no_change_vsize)`, with at most a one-vbyte
   conservative allowance if a signer has variable-size legacy signatures.
5. Set the UTXO value to `sum(inputs) - sum(all other value outputs) - exact_fee`.
   Recompose using only the first response's actually selected outpoints and
   `use_all_inputs_set=true`.
6. Accept only if `btc_change == 0`, the UTXO is wallet-owned and above dust,
   pointer and refund equal its actual index, every input is one the wallet offered,
   the exact two protocol payloads are present in the required order, and the
   independently computed fee matches the intended bound.
7. Sign the second response's untouched PSBT/raw transaction. After signing, check
   actual vsize and fee rate once more before broadcast.

UTXO value does not affect serialized size, so this reaches a fixed point in two
requests; it is not an open-ended fee-estimation loop. If the second response changes
inputs, encoding, or output order, abort rather than retrying into a looser policy.
The current compose fallback that eventually sends no `inputs_set` must be disabled
for this path. Exact Alkanes outpoints must also be sent in `exclude_utxos` on every
request, including failures and retries.

### Output-index rules

Never hard-code pointer 0 or pointer 1. The common cases are:

| Host transaction | Expected optimized order | UTXO pointer |
|---|---|---:|
| Enhanced XCP send / order / issuance without BTC destination | XCP data, UTXO, runestone | 1 |
| Plain BTC send, one pass | BTC recipient, runestone, ordinary change UTXO | 2 |
| Plain BTC send, no separate change | BTC recipient, UTXO, runestone | 1 |
| Positionally addressed XCP action | destination, XCP data, UTXO, runestone | 2 |

Multiple destinations or data outputs shift the index again. Build the protostone
after locating the wallet output, set **both** `ProtoPointer` and `Refund`, then verify
the encoded values from the finished transaction.

### RBF, CPFP, concurrency, and reorgs

- A transaction may use opt-in RBF while it has no descendants. Once a pending DIESEL tip has been
  spent by a child, replacing any ancestor invalidates the suffix; the wallet must not silently
  bump it as an isolated transaction.
- Spending the tip is ordinary dependency chaining and also acts as CPFP for its ancestors. Price
  the whole package before broadcast; a high-fee child can make the package confirm but can also
  erase the expected mint value.
- Allow exactly one pending successor per root and no branches. The wallet-authored journal moves
  the active marker from parent to child after each successful broadcast.
- Cap each unconfirmed chain at 25 under the tested default Core policy. Start another chain rather
  than attempting the 26th descendant.
- A reorg returns the old UTXO to confirmed state and invalidates its successor.
  The address-level balance must be reconciled from the Alkanes indexer rather than
  adjusted by optimistic arithmetic alone.
- Bulk concurrency is a pool of independent bounded chains. Never make several children spend the
  same tip: those are conflicts, not parallelism.

### Eligible transaction families

Start with an explicit allow-list, because “has a Bitcoin transaction” is much too
broad:

| Family | Initial policy | Reason |
|---|---|---|
| Plain BTC send with owned return value | Allow | Simplest +26-vB host |
| Enhanced XCP asset/XCP send | First supported CP family | Already mined and CP-indexed in the combined layout |
| Short order, cancel, ordinary broadcast | Allow after per-type fixture | One OP_RETURN data boundary and no special BTC payee |
| Ordinary issuance/reissuance, dividend, destroy, pool action | Skip in v1; fixture individually | Probably compatible when short, but each has distinct validation/economic semantics |
| Issuance ownership transfer or other positional destination | Skip in v1 | Exactly one intended destination must precede the first CP data output |
| MPMA | Skip in v1 | Multiple logical recipients and potentially long payload |
| Long message using bare multisig | Skip | Different parser/output economics |
| Counterparty Taproot commit/reveal | Skip | Two transactions and composer-owned reveal key |
| Dispenser open/refill/close, dispense payment, BTCPay, burn | Skip | BTC values/outputs carry protocol semantics; a harmless-looking extra output can change meaning |
| Fairmint/fairminter | Skip in v1 | May combine asset issuance/payment semantics and changing protocol state |
| Default current-form attach | Allow; mined and indexed fixture | vout 0 asset, vout 2 DIESEL UTXO, vout 3 runestone |
| Legacy/explicit attach controls, detach, move, sweep | Skip | Explicit UTXO or whole-balance semantics need separate routing fixtures |
| Existing runestone/Alkanes call | Skip | Call order, routing, and one-mint constraint |
| Exact spend with no UTXO-sized return | Ask +57 or skip | Needs a new output |
| dApp/external PSBT or raw-transaction signing | Never auto-decorate | Wallet did not construct the output contract; only block protected-UTXO spends or use an explicit integration |

An allow-listed message still has to pass shape inspection. If Core chose a
different encoding than expected, if the UTXO would be dust, if the Alkanes
indexer is unavailable or behind, or if any selected input has an unknown Alkanes
balance, minting fails closed while the underlying transaction can be recomposed
without DIESEL.

### Fee and economic policy

The extension should optimize **marginal fee**, not claim profitability. A useful
advanced policy has these independent controls:

- mode: Off / Ask / Auto;
- maximum fee rate for attaching a mint;
- maximum marginal fee in sats;
- permit +57-vB explicit UTXO: yes/no;
- consolidate only below a chosen fee rate.

Default Auto should mean “+26-vB cases only.” Ask can expose the +57-vB fallback.
Never force the ~125-vB roll silently. The review screen should show the exact
additional vbytes and sats by comparing the first ordinary compose with the final
minting compose.

This is particularly important under the released upgraded-EOA rules: total block
fees can reduce the mint pot by up to 50%, so paying a premium to enter a congested
block can raise cost while lowering reward. The mint also increments the block's
mint count and dilutes every minter. Without a trustworthy live DIESEL price,
current mint count distribution, and deployed-contract adapter, expected value is
unknown.

## Released rules and imminent version risk

The released mainnet indexer selects upgraded-EOA for `2:0` at height 917,888. See
[Alkanes `network.rs` v2.2.1-rc.4](https://github.com/kungfuflex/alkanes-rs/blob/v2.2.1-rc.4/src/network.rs).
The released contract confirms:

- opcode `77`;
- EOA/first-call only;
- one mint per transaction;
- upgraded/legacy same-block conflict; and
- `(block_reward - diesel_fee) / total_mints`, with the fee capped at half the
  reward.

See the released
[upgraded-EOA contract](https://github.com/kungfuflex/alkanes-rs/blob/v2.2.1-rc.4/crates/alkanes-std-genesis-alkane-upgraded-eoa/src/lib.rs).

The bot's fixed pointer-zero hex is not a protocol invariant. The Alkanes release
line builds mint protostones with runtime pointer and refund values. We should do
the same; reusing the frozen constant can target an OP_RETURN or an unintended
recipient depending on the transaction shape. In the proven enhanced-send layout,
both values are **1**, yielding script
`6a5d0eff7f818cec8ad0abc0a88281d215`; this is shape-specific and must be rebuilt
after composition rather than treated as a new constant.

The unreleased `tmp_gate` staging branch proposes a different v3 model at height 966,000:
fixed-share sizing against a default 5,000 mints, treasury accrual of unused
emission, and no caller payout for a bare `[2,0,77]` call. Relevant proposed files:
[height dispatch](https://github.com/kungfuflex/alkanes-rs/blob/09e25f6ae67c830b04bed2adae39f41956249b7a/src/network.rs) and
[DIESEL v3](https://github.com/kungfuflex/alkanes-rs/blob/09e25f6ae67c830b04bed2adae39f41956249b7a/crates/alkanes-std-diesel-v3/src/lib.rs).

[Pull request 305](https://github.com/kungfuflex/alkanes-rs/pull/305) merged the
initial mint-gate work into `tmp_gate` on 2026-08-31. The height-gated v3 crate and
the latest fixed-5,000 payout commit were then added directly on that staging branch.
Neither is an ancestor of `main` at this review's pinned revisions.

This does not prove v3 will activate. It proves the economic interface is actively
changing near a proposed activation point. The extension must verify a released
deployed version and live gate state, not hard-code today's call.

## Complexity and implementation budget

This is not primarily a transaction-encoding feature. The 17-byte script is the
small part; safe coexistence of two UTXO ledgers is the project.

| Workstream | Complexity | Why |
|---|---|---|
| Dynamic mint script + structural decoder | Small | Three values, but exact byte verification is mandatory |
| Two-pass no-change compose | Medium | Freeze inputs, calculate exact fee, recompose, compare both results |
| Global Alkanes UTXO protection | High | Must cover compose fallbacks, BTC builders, dApp PSBTs, consolidation, and signing |
| Confirmed/pending UTXO state + RBF/reorg | High | Outpoints change while balances must never be guessed |
| Read-only DIESEL balance row/detail page | Medium | Separate indexer and ledger model |
| DIESEL send/change transaction builder | High | Edicts, partial balance change, multiple UTXO inputs, fee funding |
| Per-family fixtures + dual-indexer harness | Medium/high | Output semantics differ across Counterparty actions |
| Live contract/version adapter | Medium today, potentially high | v3 changes the callable interface and recipient economics |

A useful scope split is:

- **Research spike:** mint decorator, exact-fee second compose, strict parser, and
  same-bytes test fixture. Roughly days, and much of the protocol uncertainty is
  already retired by this review.
- **Experimental mining beta:** add address/outpoint reads, fail-closed global UTXO
  protection, pending state, RBF recovery, hardware signing, and two or three
  allow-listed transaction families. This is a multi-workstream feature, plausibly
  a few weeks rather than a settings-toggle patch.
- **Full asset experience:** DIESEL send, shard consolidation, richer recovery,
  concurrency, and broad transaction compatibility. Treat this as a separate
  milestone.

The optimized path adds one Counterparty compose round trip before review. It does
not add a signing prompt or an on-chain transaction. Balance safety adds an Alkanes
address/outpoint lookup during refresh and a fail-closed reconciliation at compose
or signing time; cache it, but never let a stale or unavailable cache silently mark
a known UTXO as ordinary BTC.

## Extension scope

An advanced setting fits the existing architecture, but the feature is much larger
than a toggle and balance row. Minimum safe scope:

1. **Experimental setting, off by default**, a deterministic maximum mining fee rate, plus a
   protocol-health kill switch. Keep the detailed policy on the dedicated DIESEL page.
2. **Alkanes client** for address and outpoint balance reconciliation.
3. **Protected UTXO registry** refreshed on unlock, compose, and signing.
4. **Alkanes-aware coin selection** for every Bitcoin/Counterparty flow.
5. **Provider/dApp signing guard** so a site cannot spend the UTXO without valid
   carry-forward routing.
6. **Dynamic protostone builder** targeting the exact UTXO in both pointer and
   refund.
7. **Exact output verification.** The wallet currently accepts any OP_RETURN as a
   data output; it must verify the exact Alkanes script, UTXO index/value, and
   wallet ownership.
8. **Separate balance presentation:** “DIESEL · Alkanes”, with UTXO status. Do
   not manufacture a Counterparty `TokenBalance` for a different ledger.
9. **Recovery/consolidation and RBF handling** for UTXO replacement.

Relevant seams are [settings](./src/core/settings.ts),
[advanced settings](./src/pages/settings/advanced.tsx),
[compose](./src/core/counterparty/compose.ts),
[output policy](./src/core/counterparty/outputPolicy.ts), and
[balance list](./src/components/domain/balance/balance-list.tsx).

### Provider and verification boundary

Do **not** attach DIESEL mints to provider-originated raw transactions or PSBTs in
the first release. The dApp supplied exact bytes, other parties may already have
signed them, sighash modes may deliberately permit only specific mutation, and
marketplace bundles can depend on the unsigned txid or output indices. Decorating
such a request would make the wallet a transaction author rather than a verifier
and would invalidate the meaning of the existing byte-derived approval.

The provider still has to become Alkanes-aware. Its rule should be asymmetric:

- wallet-authored eligible transaction: optionally add and fully verify a mint;
- provider-authored transaction: never add a mint, but never allow an Alkanes
  UTXO to be spent invisibly.

The raw-transaction and PSBT approval paths already converge on
`analyzeSignRequest`, and both start per-input Counterparty attachment lookups. Add
an independent Alkanes outpoint lookup for every input the wallet is asked to sign,
prioritizing those inputs under any request-size cap. The initial policy should be:

| Signed-input Alkanes state | Provider decision |
|---|---|
| Confirmed empty | Continue through existing Counterparty/Bitcoin checks |
| Contains DIESEL or any Alkane | Hard block; direct the user to the wallet's protocol-aware screen |
| Lookup failed, indexer stale, or input displaced by cap | Hard block/retry; never interpret unknown as empty |

Apply this whether auto-mint is on or off. Disabling issuance cannot make an
existing or newly received UTXO ordinary BTC. Only inputs this wallet signs are
asset-loss authority in a collaborative PSBT; an Alkane on another participant's
input can be displayed but is not ours to authorize.

This must be enforced twice: in the shared approval analysis for an intelligible
error, and immediately before the low-level signer as a defense-in-depth invariant.
The signer should default-deny an owned Alkanes input unless an internal
wallet-authored operation supplies a verified Alkanes spend plan bound to the exact
unsigned transaction. Provider calls never receive that authorization. The plan
for an internal mint/send/swap must bind input outpoints and balances, runestone
bytes, output scripts and indices, pointer/refund, expected conservation or
contract simulation, and fee bounds; any byte change invalidates it.

The existing recent-broadcast shortcut also needs a cross-protocol correction.
Today `safeOwnChange` and `recent_safe_broadcast_prevouts` establish that a newly
created own output can bypass Counterparty indexing lag because its parent signed
inputs were Counterparty-attachment-free. That is not proof it is Alkanes-free.
Only journal an output as generally safe when all signed inputs were confirmed clean
on **both** ledgers and the transaction creates no Alkanes result. A mint UTXO
goes into the protected Alkanes registry, never the ordinary safe-change journal.

For `xcp_broadcastTransaction`, do not treat arbitrary signed bytes as a trusted
state transition or seed safe change. As defense in depth, refuse provider broadcast
of a transaction spending a known UTXO unless it matches a previously approved
future Alkanes-provider flow. This is not a complete security boundary—a dApp can
broadcast elsewhere—but prevents this extension from publishing or blessing a
known destructive spend.

A future dApp-facing Alkanes capability should be separate and explicit, not folded
into `xcp_signPsbt`. It would require a local runestone/protostone decoder, exact
input/output balance simulation, recognized contract IDs/code hashes, own
change/refund proof, strict slippage/deadline checks for swaps, and output-committing
sighashes. Until that exists, even a provider PSBT containing an apparently valid
runestone is blocked when it spends one of our UTXOs; opaque contract execution
is not evidence of safe preservation.

No DIESEL balance or UTXO list needs to be exposed to websites for the mining
feature. A read API can be considered later under a distinct permission. The only
provider cost in v1 is one batched/fanned-out Alkanes outpoint check during approval;
if it cannot complete, signing fails closed rather than sacrificing the asset for
provider availability.

### Product shape

The home balance list can include a protocol-aware row, but it should be a union of
wallet balances rather than a fake Counterparty asset:

```text
DIESEL                                  12.3456
Alkanes · 1 protected UTXO              pending 0
```

Clicking it should open a dedicated DIESEL screen, not the generic Counterparty
asset screen. Show:

- confirmed spendable DIESEL and pending mint rewards;
- number and total BTC value of protected UTXO UTXOs;
- active/pending UTXO outpoint and confirmation state;
- the detected DIESEL contract/rules version and whether minting is currently
  enabled by the live gate;
- **Send**, **Consolidate/repair UTXOs**, and **View transaction/outpoint**.

Sending DIESEL is feasible, but is its own Alkanes transaction builder. A partial
send spends the UTXO(s), uses an explicit DIESEL edict for the recipient amount,
and routes the remainder to a new own output. The upstream CLI does exactly this
kind of “needed amount plus change/collateral” split. Initially, do not also mint in
a DIESEL-send transaction: the just-minted amount is block-dependent and combining
it with a partial transfer complicates deterministic review and change accounting.

Turning auto-mint off must **not unlock the UTXO as BTC**. It stops adding new
mints but keeps all Alkanes-bearing outpoints protected and keeps the DIESEL screen
available. Suggested setting levels are:

- `Off`: no new mint; protection and sending remain active.
- `Ask on eligible transactions`: recommended experimental default.
- `Auto`: attach whenever contract health, output shape, relay policy, and UTXO
  state all pass.

The confirmation screen should state the measured extra vbytes/fee and the routing
destination, not estimate a profit.

### Asset lifecycle: from zero DIESEL to a BTC exit

No pre-existing “special UTXO” is required for the first mint. An eligible host
transaction calls `[2,0,77]` and points the result to a wallet-owned output. Once
confirmed, that output is a UTXO and must enter the protected registry. Later
mints can spend and replace it, in which case the exact indexer test proves the old
balance plus the new reward reaches the successor. They can also mint to another
owned output without spending the old UTXO, producing a second shard. The home
balance is therefore the sum of indexed outpoint balances, not a value attached to
one forever-fixed baton.

The wallet state machine should be explicit:

| State | Wallet behavior |
|---|---|
| Off, no balance | No Alkanes output; ordinary operation |
| Ask/Auto, no balance | Mint to a natural own output or explicit UTXO on an eligible transaction |
| Ask/Auto, confirmed balance | Protect every UTXO; roll one only when it is already useful as BTC funding, otherwise create a shard or skip |
| Mint transaction pending | Reuse only a wallet-authored verified tip; at depth 25 protect it and use clean BTC only if another real transaction proceeds |
| Off, balance remains | Stop minting, but continue discovery, protection, Send, Consolidate, and recovery |
| Indexer unavailable or behind | Display last-known balance as stale and block UTXO spending/mint decoration |

“Background earning” must be described narrowly: the extension opportunistically
adds a mint to an outgoing eligible transaction. It is not mining while idle, and
the resulting token has no guaranteed BTC value.

#### Sending and consolidating DIESEL

A DIESEL transfer does not depend on an AMM or redemption service. Spend enough
indexed UTXO inputs, add an edict assigning the exact amount to the recipient's
standard Bitcoin output, and assign the exact remainder to a new wallet-owned
change UTXO. The released prediction tests exercise this shape with 800 units to
the recipient and 200 units to change from a 1,000-unit UTXO. For the extension,
make both assignments explicit and require a pre-sign simulation to prove:

- every selected UTXO and its complete Alkanes balance was discovered;
- recipient amount plus wallet change equals the DIESEL inputs exactly;
- pointer and refund are wallet-owned safe outputs;
- BTC fee inputs were selected only after all other Alkanes-bearing UTXOs were
  excluded; and
- the recipient and change balances decode as expected from the finished unsigned
  transaction.

Consolidation is the same transaction with no external recipient: spend several
UTXOs and route their total to one own output. It should be manual or scheduled
for low fees. Do not attach a mint to either Send or Consolidate in v1; deterministic
amount review matters more than saving one future mint.

#### DIESEL is not directly redeemable for BTC

The DIESEL contract exposes mint and metadata operations, not a claim on BTC. The
available exit is market- and service-dependent:

```text
DIESEL UTXOs -> AMM swap -> frBTC UTXO -> queued Subfrost unwrap -> BTC payout
```

At indexed height 965,511 on 2026-09-04, the public Subfrost pathfinder returned a
live DIESEL `[2:0]` to frBTC `[32:0]` route. For 100,000,000 raw DIESEL units it
quoted 56,252 frBTC base units through pools `[2:78528]` and `[2:80663]`. It also
reported a direct pool `[2:77087]` holding 17,431,999,509,559 raw DIESEL units and
9,622,663,998 frBTC base units. This demonstrates current discoverable liquidity;
it does **not** guarantee execution, price, honest indexing, or future liquidity.
The extension must obtain a fresh route, query the actual factory/pool contracts,
simulate the exact call, and enforce `minimum_output` plus a short block-height
deadline. Never hard-code the sampled route or quote.

The deployed frBTC metadata identifies opcode `78` as `unwrap`, and the released
CLI constructs an unwrap request with a BTC recipient, a Subfrost signer dust
output, and an Alkanes refund output. Unwrap is asynchronous: burning/escrowing
frBTC queues a payment, then the signer service spends the designated outpoint in
an aggregate Bitcoin transaction. The recipient therefore accepts signer-quorum,
liveness, implementation, and fee/premium risk; this is not trustless atomic
redemption.

Use **two confirmed stages** in the extension:

1. Swap DIESEL to frBTC, return frBTC and any DIESEL change to owned outputs, wait
   for confirmation, and reconcile both balances.
2. Submit a separate single-protostone frBTC unwrap, wait for it to appear in the
   pending queue, and track the eventual Bitcoin payout independently.

Do not copy the CLI's combined swap-plus-unwrap transaction for v1. A released
indexer regression test documents that multi-protostone unwraps can exhaust the
post-943,500 fuel budget, while a separate unwrap is easier to simulate, refund,
and monitor. The CLI's reference minimum formula is
`ceil((546 + aggregate_fee_share) / (1 - premium))`; with its illustrative 10
sat/vB, 10-input/10-output aggregate and 0.1% premium, the conservative minimum is
1,736 sats. Compute this from current service parameters and fees rather than using
that example as a constant. As a rough scale check, the live pathfinder quoted
1,235 sats for 1,600,000 raw DIESEL units and 2,142 sats for 3,000,000 raw units.
Thus tiny rewards may be swappable but remain below the unwrap threshold until they
accumulate; the wallet should retain frBTC or DIESEL rather than submit a request
the signer will skip. Under the proposed v3 default-share formula, one successful
bare-gate payout would be 62,500 raw units, so those two examples correspond to
roughly 26 or 48 such rewards before swap fees and price movement. This is an
illustration, not an EV claim or proof that v3 will activate.

There is not yet enough evidence to label this route production-ready. The public
REST history endpoints returned zero wrap records, zero unwrap records, and total
unwrapped BTC of zero during this review. That may be an empty/unbackfilled analytics
service rather than proof that Subfrost has never paid anyone, but either way it does
not prove liveness. Before exposing “Convert to BTC,” require a controlled small
mainnet round trip or independently identify a recent unwrap request and its
fulfilled BTC transaction. Also test the refund path and a request just below the
minimum.

The dedicated detail screen should consequently separate capabilities and risk:

- **Send:** protocol-native transfer; enable after transaction simulation tests.
- **Swap:** AMM execution; show route, reserves, price impact, minimum received,
  deadline, Bitcoin fee, and contract IDs.
- **Convert to BTC (experimental):** show “Swap confirmed / Unwrap queued / BTC
  paid,” the estimated premium and aggregate fee share, and a recovery/refund state.
  Disable it if no executable route, adequate output, current indexer, recognized
  factory/code hash, or healthy unwrap service can be proven.

For an internal alpha, minting plus read-only balance and global UTXO protection
is defensible even before conversion is solved, because users can still transfer
DIESEL protocol-natively. For a public release, however, a balance with no Send or
recovery transaction is a trap. At minimum ship Send/Consolidate or provide a tested
recovery handoff to compatible tooling; never suggest users spend the UTXO as
ordinary BTC.

### Eligibility is transaction-shape based

Plain BTC sends are actually the easiest host: the recipient output is already an
ordinary Bitcoin output, so a one-pass transaction can be `recipient -> Alkanes
OP_RETURN -> change`, with the mint routed to own change. They can achieve the 26-vB
case without Counterparty data at all. Such a transaction is not expected to be a
Counterparty message; Counterparty's parser will not accept the unfamiliar runestone
as its own data. Therefore never add it to dispenser payments, BTCPays, burns, or any
BTC transfer expected to trigger Counterparty semantics.

For an enhanced XCP send whose first output is Counterparty data, the wallet still
needs an explicit own boundary/UTXO before the Alkanes OP_RETURN. A one-pass
compose leaves separate change and costs 57 vB; the proven two-pass exact-fee compose
makes that same UTXO absorb change and costs 26 vB. Other transaction types are
eligible only after inspecting the composed output shape; the distinction is not
BTC versus XCP.

The first release should fail closed on Counterparty Taproot commit/reveal,
multisig-encoded data, legacy/explicit attach controls, detach/move, existing
runestones, no-change/exact-spend shapes, unavailable Alkanes state, and a pending
UTXO roll. These can be added individually after fixtures prove their routing.

## Recommended prototype

Use a strict allow-list: plain BTC sends with UTXO-sized return value and
data-bearing XCP sends or default current-form attaches whose actual encoding is OP_RETURN; no
Counterparty Taproot; no burn/dispense; no legacy attach controls, detach, or move; no transaction
already carrying Alkanes; and no mint when released contract/gate status is
unavailable. Implement the two-pass exact-fee compose as the target path and retain
the one-pass explicit-output shape only as a user-visible fallback.

Acceptance gates before mainnet:

1. Feed one identical raw fixture to both full indexers with the XCP message
   unchanged and DIESEL only on the wallet UTXO. Counterparty recognition and
   Alkanes rollover have now passed separately using the same output shape.
2. Wrong order, pointer, refund, UTXO omission, second mint, and UTXO spend
   without routing must all fail closed.
3. Exercise `testmempoolaccept` and every extension broadcaster.
4. Verify RBF and hardware-wallet PSBT signing preserve exact inputs and outputs.
5. Reconcile address- and outpoint-level Alkanes balances after confirmation.
6. Re-evaluate after height 966,000 against a released build and live mint gate.
7. Measure signed vsize and economic value; never advertise profitable mining.

## Recommendation

**GO for the single draft feature PR now implemented. NO-GO for merging it as a public release
until the activation-height behavior, live address reconciliation, and end-to-end mint/send
fixtures are rerun against the deployment users will actually hit.** A fulfilled frBTC unwrap is
still required before adding a “Convert to BTC” action, but it does not block mining, balance
display, or protocol-native Send.

The spike should target the two-OP_RETURN/current-Core construction. It requires no
Counterparty protocol change and no bare multisig for ordinary short messages.
Taproot may be used for a UTXO output, but Counterparty's Taproot message encoding
should be excluded.

The interesting part of the supplied proposal is real. The hard part is not making
a 17-byte OP_RETURN; it is guaranteeing that every later spend preserves a second
protocol's asset state while that protocol's payout and routing rules are changing.

## Review provenance

- Extension: local checkout `2cb74a810298723897029a6e52b7eeb5b8289395`
- Counterparty Core: official repository at `67e10db3ee266068c1effc4e83653df39ace5ca8`
- Alkanes release line: official `main` at `62511e9371a3f9e448841140c51cfe428cfcb955`;
  mainnet tag `v2.2.1-rc.4`
- Proposed v3: `origin/tmp_gate` at `09e25f6ae67c830b04bed2adae39f41956249b7a`
- Review height: Dan supplied 965,504; later in the same review both Bitcoin Core
  and the public Metashrew endpoint returned 965,511. The endpoint is documented in
  the [Alkanes README](https://github.com/kungfuflex/alkanes-rs/tree/62511e9371a3f9e448841140c51cfe428cfcb955).
- Live market/exit checks: public Subfrost `ammdata.find_best_swap_path`,
  `ammdata.get_pools`, `essentials.get_alkane_info`, and the documented wrap/unwrap
  history REST endpoints, queried 2026-09-04. Treat these as contemporaneous
  service observations, not consensus proofs.

No mainnet spend was performed. A combined transaction was broadcast and mined on
the DigiRare regtest stack, and the analogous Alkanes consensus-indexer rollover
test passed. A same-raw-transaction dual-indexer integration test and production
relay testing remain outstanding. A targeted native CLI-common send test rerun was
attempted but the local host lacked `protoc`; the inspected explicit-change test is
therefore source evidence in this review, not a newly executed result.
