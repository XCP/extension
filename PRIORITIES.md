# Priorities — verification & hardening surface

Compiled 2026-08-03, worked through the same day. Ranked by severity: what a malicious API or dapp
can make happen to a user who follows the UI.

**Everything actionable is fixed and merged (PRs #221-#226).** What remains — 3c, 3d, 3e — are
policy decisions about whether to start blocking things the wallet currently permits, not
trust-boundary bugs. They need a judgement call rather than an implementation.

| Item | Status |
|---|---|
| 0. Inscriptions broken end to end | **fixed** — #221 |
| 1. Fee shown was the API's claim | **fixed** — #224 |
| 2. Screens rendered the echoed destination | **fixed** — #226 |
| 3. Provider screen rendered the API's decode | **fixed** — #223 |
| 3a. False "no tampering detected" | **fixed** — #222 |
| 3b. Partial prevout understated the fee | **fixed** — #223 |
| 4b. MPMA memo-flag coverage gap | **fixed** — #225 |
| 3c. Fee-warning band is wide; warnings never block | **open — policy** |
| 3d. No output accounting on provider paths | **open — policy** |
| 3e. No connection re-check before signing | **open — policy** |
| 5. Subasset borrow griefing vector | **guarded** — #219; full fix needs an independent ledger view |
| 6. Vulnerable transitive deps (Trezor) | **open — product decision**, no upstream fix exists |

Untracked on purpose, like HANDOFF.md and RED-TEAM-FINDINGS.md.

"Confirmed" = traced end to end in the code. "Needs live test" = the reasoning holds but one step is
only observable against a real node.

---

## 0. Inscriptions were broken end-to-end — **FIXED, merged as PR #221 (`2dc328a9`)**

How it was found, kept for the reasoning trail. Two defects stacked; the second masked the first,
and a third (a malformed request) sat in front of both.

**(a) The extension never handled the reveal transaction.** Inscribing sends `encoding=taproot`
(`compose/broadcast/form.tsx:94,206`, `compose/issuance/form.tsx:135`). Core then composes an
*ord-style commit/reveal pair*: `prepare_taproot_output` (`composer.py:476-493`) pays a commit
output to `source_pubkey.get_taproot_address([[envelope_script]])`, where the key is
**generated randomly by the server** (`generate_random_private_key`, `composer.py:443-446`), and
returns the pre-signed reveal in `signed_reveal_rawtransaction` (`composer.py:1153`). The inscribed
content reaches the chain only when that reveal is broadcast after the commit confirms.

`signed_reveal_rawtransaction` appears **nowhere in `src/`** — grep returns nothing. The wallet
broadcasts `rawtransaction` (the commit) only. So the content is never published, and the commit
value (reveal fees + dust) sits at an address spendable only via the server's ephemeral key. Core
does route the reveal's change back to the user (`get_reveal_outputs`, `composer.py:354-363`), so
the value is recoverable *if* someone broadcasts the reveal — but the wallet never does and never
stores it.

**(b) Output policy blocked the flow, which is why nobody lost money.** The commit output
pays a P2TR address that is neither an address the request names nor one the signer controls, so
`checkOutputPolicy` classifies it unexplained and rejects the transaction
(`outputPolicy.ts:152-155`). Inscribing has therefore been **failing closed since #214** — the
deny-by-default design catching a real bug it was not written for.

**Why it went unnoticed:** the E2E test named "file upload workflow"
(`e2e/pages/compose/broadcast/index.spec.ts:140-180`) only drives the file picker and asserts the
filename renders. It never submits a compose, so no test covers composing, verifying, signing or
broadcasting an inscription.

**Scenario if (b) were relaxed without fixing (a):** user inscribes a file, signs, pays the commit;
the inscription never appears on chain and the committed sats are stranded until the reveal is
broadcast by someone who still holds it.

**PROVEN AGAINST A LIVE NODE.** I composed a real inscription broadcast
(`encoding=taproot`, `mime_type=image/png`, `inscription=true`) against api.counterparty.io and ran
the response through the wallet's own verification code:

```
LAYER1 extractCounterpartyPayload: null -> message verification SKIPPED
LAYER2 checkOutputPolicy ok: false
LAYER2 unexplained: [{"index":0,"address":"bc1pk828a69sm0lycjve30m8yhrnuhh4vpks34w2qejtckp28m27pfkqzm0l0a","value":875}]
```

The response carried `signed_reveal_rawtransaction` and `envelope_script` — both ignored by the
extension — and the `data` field (the Counterparty message) is *not* in any OP_RETURN of the commit
transaction, confirming why layer 1 finds nothing.

**STATUS: fixed, not disabled.** There turned out to be *three* independent defects, not one, and
all are closed in #221:

1. **The request was malformed** — `inscription` is a boolean construct param to core, but both
   forms sent the file content in it, so composing returned `"Invalid boolean: inscription"` and no
   inscription could ever be built. Content belongs in `text`/`description`, hex-encoded unless the
   MIME type is textual. Issuance additionally never set the flag.
2. **The message was unverifiable** — the packers declined inscriptions outright, so byte equality
   said nothing about the one type whose payload is a user-supplied file. They now encode content
   as core does and pack normally.
3. **The commit output and the missing reveal** — both closed as described below.

End-to-end proof against a live compose: `pack: ok`, `envelope ok: true`, derived commit address
matching the transaction output, `reveal ok: true`, and `output policy ok: true` where it
previously rejected.

**How the fix works.** `inscriptionEnvelope.ts` rebuilds the ord envelope from the message the
request should produce and requires the composed one to match byte for byte, then derives the
commit address from that envelope and passes it to the output policy as an intended destination —
explained by proof, not exemption, so a substituted inscription still fails closed. The pre-signed
reveal's outputs are verified to pay only the signer, and it is broadcast right after the commit
(safe because it spends the commit's output, whose txid is fixed before signing since its inputs
are segwit — the reason taproot encoding requires a segwit source). Layout verified against ord's
`src/inscriptions/tag.rs`, not core alone.

**Follow-up worth doing:** a rejected reveal currently surfaces as a warning carrying the reveal
hex, with no retry. The commit is already on chain at that point, so the content can still be
published by broadcasting the stored hex — but nothing in the UI does that yet.

**How the reference wallets compare, for context:**

- **Horizon (Unspendable Labs)** — ships 19 compose screens and has **no broadcast screen and no
  inscription support at all** (`lib/presentation/screens/`; zero hits for taproot / mime_type /
  reveal / envelope in `lib/`). The other production Counterparty wallet simply does not offer this.
- **Xverse** (`xverse-core/transactions/inscriptionMint.ts:249-310`) — delegates to a service. The
  wallet calls `createInscriptionOrder(...)` → `{commitAddress, commitValue}`, builds an **ordinary
  `SEND_BTC` to that address**, signs it, then hands the hex to
  `executeInscriptionOrder({commitAddress, commitTransactionHex})`, which broadcasts commit *and*
  reveal and returns `revealTransactionId`. **The wallet never handles the reveal transaction.**

What we shipped is closest to Xverse's insight — make the commit explicable as an ordinary payment
to a *known* address — but without their service dependency: the address is derived locally from a
verified envelope rather than handed over by a server, and core already pre-signs the reveal, so no
inscription service is involved.

**Do not exempt taproot composes from output accounting** if this is ever revisited — that would
unblock a flow that loses both the user's content and the committed sats.

---

## 1. The fee shown to the user is the API's claim, not the fee the transaction pays — HIGH

**Confirmed.** `checkTransactionFee` recomputes the real fee independently (inputs − outputs, inputs
resolved from the chain, never from the response) and returns it as `computedFee`
(`feeVerification.ts:160`). The composer **discards it** — `composer-context.tsx:445-452` uses only
`feeCheck.ok`. The review screen then renders `result.btc_fee`, the API's own assertion
(`review-screen.tsx:101`).

The bound that *is* enforced is loose: `max(10_000, rate × vsize × 10)` (`feeVerification.ts:175`,
`USER_FEE_RATE_TOLERANCE = 10`, `MIN_BOUND_SATS = 10_000`). So:

| transaction | honest fee | max fee that still passes | overpay |
|---|---|---|---|
| 250 vB @ 2 sat/vB | 500 | 10,000 | 9,500 (20×) |
| 400 vB @ 10 sat/vB | 4,000 | 40,000 | 36,000 (10×) |
| 1000 vB @ 3 sat/vB | 3,000 | 30,000 | 27,000 (10×) |

**Scenario:** a hostile API composes a transaction paying 20× the honest miner fee and reports
`btc_fee` as the honest number. Every check passes, the review screen shows the honest number, the
user signs and overpays. Value goes to miners, so this is griefing rather than theft — unless the
API operator also mines.

**Fix:** carry `computedFee` into composer state and render *that*; flag a divergence from
`result.btc_fee` as a warning. Small change, closes the display half. Separately, consider whether
10× / 10k sats is the right tolerance now that inputs are resolved independently — it was set when
the computation was less trustworthy.

---

## 2. Layer 4 (display from decoded bytes) is 1 screen of 28 — HIGH

**Confirmed.** ADR-019 says the approval screen must render from the decoded transaction, never the
API's echoed params. In practice `src/pages/compose/send/review.tsx` is the only review screen that
reads `state.decodedMessage`; the other 27 render `result.params` via `ReviewScreen`.

Severity depends on whether byte equality covers the type, because if the packed bytes matched, the
params provably describe the message:

- **Backed by byte equality** (params are proven): send, MPMA, issuance/subasset, sweep, destroy,
  cancel, order, dividend, fairmint, fairminter, dispense, broadcast. Display echo is *sound* here,
  though still indirect.
- **Not backed** — field comparison only, so unenumerated fields are unchecked *and* the screen
  shows the API's version of them: **btcpay, dispenser, pooldeposit, poolwithdraw, attach, detach,
  move, burn**. Screens: `order/btcpay/review.tsx`, `dispenser/review.tsx`, `pool/*/review.tsx`,
  `utxo/*/review.tsx`.

**Scenario:** a compose type with no packer returns a message differing in a field nobody enumerated;
the review screen displays the request's value for that field, so the user cannot see the
difference. The output policy still bounds where *value* goes, which is what keeps this out of
critical.

**Fix:** render the unpackable types from `state.decodedMessage`. Those seven screens are the whole
job, and they are the ones where it actually matters.

---

## 3. The dapp approval screen renders the API's description of the transaction, not a local parse — HIGH

**Confirmed.** Scope correction first: the provider exposes **no compose method**. Sites hand over a
finished `rawTxHex` (`providerService.ts:689`) or PSBT (`:748`), so there is no "dapp-initiated
compose" to apply byte equality to, and no `checkTransactionFee` / `checkOutputPolicy` caller can
exist on this path. What matters is how the wallet *describes* the bytes it is about to sign.

`useSignTransactionRequest.ts:95` decodes the transaction by calling
`decodeRawTransaction`, which is an **HTTP call to the Counterparty API**
(`transaction.ts:64-76`, `POST {apiBase}/v2/bitcoin/transactions/decode`) — the same API ADR-019
declares untrusted. Everything on the approval screen derives from that response:

- inputs and their values: `vin.prevout.value` (`useSignTransactionRequest.ts:101`),
- outputs, addresses and amounts: `decoded.vout` (`:112-120`),
- the fee: `totalInputValue - totalOutputValue` (`:142`) — computed, but from API-supplied numbers.

The independent chain lookup exists but is **all-or-nothing**: `fetchInputValues` runs only when *no*
input carries a value (`:123-125`), so an API that supplies values for every input is never
cross-checked.

**Scenario:** a hostile (or MITM'd) API returns a decode that describes a benign transaction while
the raw hex the user actually signs pays an attacker. The signature is over the hex, not over what
was displayed. The local `providerVerify` cross-check covers the *Counterparty message*
(`approve.tsx:88`, `localUnpack`) but not inputs, outputs, addresses or fee.

**Also confirmed:** `checkTransactionFee` and `checkOutputPolicy` are called from exactly one file —
`composer-context.tsx`. The dapp screens use only `exceedsSaneFeeRate`, a ceiling that **warns
rather than blocks** by deliberate choice (`approve.tsx:191-196`). With `strictTransactionVerification`
off, a *failed* verification also only warns.

**Worse than it first looks — the "local" unpack is not independent.** The payload the local
unpacker parses is extracted from the *API's* output scripts, keyed by the *API's* first input txid
(`useSignTransactionRequest.ts:151-156`):

```ts
counterpartyDataHex = extractPayloadFromOutputs(
  decoded.vout.map((vout: any) => vout.scriptPubKey?.hex ?? ''),
  inputs[0]!.txid
) ?? undefined;
```

So both sides of `verifyProviderTransaction`'s comparison inherit the same untrusted source. The
PSBT path does not share this defect: it parses locally with `@scure` (`psbt.ts:319-416`) and uses
the API only for enrichment.

**Fix:** parse `request.rawTxHex` locally and render inputs/outputs from that parse, demoting the
API decode to enrichment — the shape the PSBT path already has. `extractCounterpartyPayload(rawTxHex)`
already exists (`opReturn.ts:125-153`) and is what the compose path uses. Resolve input values from
the chain per input rather than only when all are missing (see 3b). This one change also de-roots
findings 3a and 3b from API trust.

### 3a. "Verified locally — no tampering detected" is shown when nothing was compared — HIGH

**Confirmed.** When there is no API message to compare against, verification returns success:

```ts
// If no API message to compare against, local unpack success is enough
if (!apiMessage) {
  return { passed: true, mismatches: [], localUnpack };
}
```
(`providerVerify.ts:611-618`)

and the UI renders the green shield reading **"Verified locally — no tampering detected"**
(`verification-status.tsx:46-52`). `decodeCounterpartyMessage` returns null on any failure — network
error, non-200, or an error field in the response — and the caller swallows the exception
(`useSignTransactionRequest.ts:157-168`).

**Scenario:** the API is degraded, or the attacker submits a payload our unpacker parses but core
rejects; no cross-check happens and the user is affirmatively told no tampering was detected. This
is the only place the provider path makes a positive security claim, and it is loudest exactly when
it verified least. **Cheap fix, high value:** distinguish "verified" from "could not verify".

### 3b. Partial prevout resolution understates the displayed fee — MEDIUM

**Confirmed code; trigger needs a live test.** The chain fallback is all-or-nothing:
`const hasInputValues = inputs.some(i => i.value != null && i.value > 0);`
(`useSignTransactionRequest.ts:123-125`). If the API returns a value for *any one* input, the
lookup is skipped for *all*, and unresolved inputs contribute 0 to the total — understating the fee,
which is also what `hasHighFee` is computed from. Partly mitigated: `computeMoneyMovement` marks the
summary `incomplete` when an input value is undefined (`money-movement.ts:76-83`).

### 3c. The fee warning band is very wide, and warnings never block — MEDIUM

`hasHighFee` feeds only the display; it never reaches `shouldBlockSigning`
(`transaction/approve.tsx:196-197, 204`). Warn-not-block is deliberate for site-built transactions
(documented at `:191-195`, commit ba3e8d79) and is not the issue. The band is: a 250-vByte
transaction at 4,999 sat/vB burns ~1.25M sats (~0.0125 BTC) in fees while sitting under both the
0.1 BTC absolute ceiling and the 5,000 sat/vB rate ceiling — no signal at all.

### 3d. No output accounting on the provider paths — MEDIUM

There is no `checkOutputPolicy` equivalent. The only output-level check is
`analyzeTransactionSafety`, and `blocked` is set for exactly one condition — sweep
(`transactionSafety.ts:40-42`). "BTC sent to external address" is `danger`, not `block`. Two holes:
a suspicious output is recorded only `if (output.address)` (`:172-174`), so an output whose script
cannot be attributed (bare multisig, P2WSH) raises no danger at all — it shows as "Unknown address"
in the money-movement list — and outputs ≤ 546 sats are skipped as dust.

### 3e. The raw-tx screen does not re-check the site is still connected before signing — MEDIUM

`transaction/approve.tsx:147-173` checks only identity. The PSBT screen additionally calls
`getPsbtPermissionError`, which re-runs `hasPermission(origin)` (`psbt/approve.tsx:77-82`).
Approval flows live up to 10 minutes, so a site revoked mid-flow can still get a signature.

---

## 4. Inscription message verification is skipped (secondary to item 0) — MEDIUM

Separate from item 0's functional breakage: for a taproot compose, `extractCounterpartyPayload`
finds no OP_RETURN or bare-multisig data output (the payload is in the envelope script), returns
null, and the composer treats null as "not a Counterparty transaction, allowed through"
(`composer-context.tsx:~430`) — message verification is skipped entirely. Byte equality is also
declined by design (packers refuse `inscription` / non-text MIME). If item 0 is fixed and
inscriptions become reachable, this gap becomes live: nothing would check that the envelope carries
the message the user asked for. Fixing it means parsing the envelope script — the reason the
packers decline it today.

**Top item for the funded-wallet session**, together with item 0.

---

## 4b. MPMA byte verification silently declines when hex memos coexist with empty ones — LOW (coverage gap, safe direction)

**Confirmed by self-review of code written today (#216); no agent involved.** The packer rejects a
mixed `memos_are_hex` list across *all* entries:

```ts
const flagValues = typeof params.memos_are_hex === 'string'
  ? params.memos_are_hex.split(',').map((value) => value === 'true')
  : [params.memos_are_hex === true];
if (new Set(flagValues).size > 1) return null;
```
(`pack/messages.ts`, `packMpmaFromParams`)

but `composeMPMA` filters the same list to entries whose memo is non-empty
(`compose.ts`: `(memos_are_hex ?? []).filter((_, i) => memos[i] !== '')`). The MPMA form emits one
flag per row via `isHexMemo(r.memo || '')`, so a row with no memo emits `false`
(`compose/send/mpma/form.tsx:202`).

**Consequence:** a CSV mixing a hex memo with any no-memo row produces flags like `true,false`.
`composeMPMA` correctly sends `memos_are_hex=true`; the packer sees two distinct flags, returns
null, and byte verification declines to field comparison. Fails in the safe direction — it never
falsely passes — but it silently removes byte equality from a legitimate and not-unusual flow, and
the oracles cannot catch it because they pass uniform flags.

**Fix (small, ready to apply):** filter `flagValues` to indices whose memo is non-empty, mirroring
`composeMPMA`, and add a unit case with `memos: 'beef,'` / `memos_are_hex: 'true,false'` asserting
the packed bytes match core's for the hex-memo-plus-empty-row shape.

---

## 5. Subasset borrow griefing vector — MEDIUM (guarded, not closed)

Recorded in full in RED-TEAM-FINDINGS.md (addendum). A substituted borrowed asset id can land an
operation on a different numeric asset the user owns. #219 limits the borrow to recoverable
operations (issue, describe) and refuses lock/reset/transfer. Closing it properly needs an
independent ledger view or local composition. No attacker profit — griefing only.

---

## 6. Vulnerable transitive deps from a disabled feature — LOW

`npm audit`: 13 advisories (11 low, 2 moderate, 0 high/critical), all reachable only through
`@trezor/connect-webextension@9.7.3` → `@trezor/utxo-lib` / `crypto-browserify` → `elliptic`
(GHSA-848j-6mx2-7j84, **no fix available upstream**). 9.7.3 is already the latest published version.
Hardware-wallet selection was disabled in the popup in #206, but the Trezor code and dependency are
still bundled (`utils/hardware/trezorAdapter.ts`, `wallet-context.tsx`, `walletService.ts`).

**Fix options:** (a) accept and document — no fix exists upstream, severity is low; (b) if hardware
wallets are staying disabled, drop the dependency entirely, which removes all 13 advisories and
shrinks the bundle. Worth a product decision rather than a patch.

---

## Not findings — checked and clear

- **Provider cannot alter settings or the API endpoint.** No settings-write surface is exposed to
  sites; the provider's method list is accounts/balances/history plus the four sign methods.
- **Message signing is domain-separated.** `messageSigner.ts:37` uses the
  `\x18Bitcoin Signed Message:\n` magic prefix (and BIP-322 tagged hashes), so a dapp cannot get a
  transaction signature by passing a sighash as a "message".
- **`strictTransactionVerification` cannot weaken the wallet's own compose path.** It is read only
  by the two dapp approval screens; `composer-context.tsx` throws on verification failure
  unconditionally. Default is `true` (`settings.ts:145`). Turning it off downgrades a *failed*
  verification on a site-supplied transaction to a warning — a documented user choice, worth
  keeping in mind when triaging item 3.
- **Staleness is enforced at sign time**, not only at compose (`composer-context.tsx:612`).
- **Output policy's own logic is sound**: each intended destination is consumed once (so one
  requested payee cannot explain two outputs), pinned values must match exactly, unattributable
  scripts are unexplained, and an unparseable transaction defers to the signer rather than passing.

---

---

## Suggested order of work

1. ~~**Item 0 (inscriptions)**~~ — done, merged as #221.
2. **Item 3a (false "no tampering detected")** — smallest fix in this document and it removes an
   affirmative false assurance. Distinguish "verified" from "could not verify".
3. **Item 3 (provider display)** — parse `rawTxHex` locally instead of trusting the API's decode.
   Contained, closes the largest remaining trust hole, and de-roots 3a and 3b from API trust.
4. **Item 1 (fee display)** — small, immediate honesty win on the compose path.
5. **Item 2 (seven review screens)** — mechanical once item 1's pattern exists.
6. Items 5, 6 and the lower-severity provider list — decisions and triage, not urgent code.

Items 0 and 4 are also the agenda for the funded-wallet session, which is still the one thing the
oracles cannot substitute for.

---

## Lower-severity provider findings (from the audit, not independently re-verified)

Recorded for triage; each cites source but I confirmed only 3 and 3a myself.

- **providerVerify agrees by default on absent fields** — most comparisons are guarded by "compare
  only if the API supplied it", so an omitted field yields agreement rather than a flag
  (`providerVerify.ts:114-117, 218-221, 255-258, 289-297, 503-506, 517-573`). `detach` and
  `dispense` compare nothing; unknown types compare only the type id; `enhanced_send` never compares
  the memo; MPMA skips verification when the API returns no sends array.
- **One signature is produced with no approval screen** — `generateConnectionProof`
  (`providerService.ts:250-295`) auto-signs a BIP-322 message on every `xcp_requestAccounts`. The
  message format is fixed and origin-bound (`:266`), so it cannot be coerced into signing chosen
  text. Low, but it is the literal answer to "signature without decode-based display".
- **`xcp_signTransaction` does not validate its param is hex** (`:690-698`) — UX/DoS only.
- **Dead approval route**: `approvalService.ts:217-218` routes type `'compose'` to
  `/requests/compose/approve`, a page that does not exist. No exposure; suggests a removed path.

## Mitigations worth knowing before triaging the above

- Raw-tx signing requires every input to be a **current UTXO of the active address**
  (`transactionSigner.ts:82-142`), so a site cannot get third-party inputs signed.
- PSBT `signInputs` are bound to their actual prevout address and rejected otherwise
  (`psbt.ts:666-671`); best-effort signing fails closed on unattributable inputs (`:468-480`).
- Sighash allowlist is enforced on the **effective** sighash, so a PSBT-embedded SIGHASH_NONE cannot
  bypass the parameter check (`psbt.ts:28-33, 510-516`).
- Legacy PSBT inputs require the full previous transaction (`allowLegacyWitnessUtxo: false`,
  `psbt.ts:443`), closing the fake-amount fee drain.
- **Sweep is hard-blocked** on both provider paths (`transactionSafety.ts:40-42`).

## Provenance

Findings 0, 1, 2, 3, 3a and the "checked and clear" list were traced end to end directly in this
session; counterparty-core claims were verified against the ca2496dd clone rather than recall.
Findings 3b-3e and the lower-severity list come from a subagent audit of the provider path — cited
to source but **not independently re-verified**, so confirm before acting. That audit also corrected
an error in my first draft of item 3, which assumed a dapp-initiated compose path that does not
exist.

**The adversarial review of the recent packer changes was done by hand**, after that subagent idled
five times without reporting. Coverage of the five focus areas:

- **Memo / hex-flag handling** — finding 4b above.
- **`packAddressLegacy` input validation** — *clear*. `decodeBase58Check` verifies the double-SHA256
  checksum and throws on mismatch (`unpack/address.ts`), so a corrupted base58 address cannot pack.
  Witness programs over 20 bytes (Taproot, P2WSH) throw, matching core's
  `p2wsh still not supported for sending`. Testnet addresses and witness versions pack the same way
  core's `pack_legacy` does, so bytes still agree.
- **`verifyBroadcast` timestamp bound with an empty-string `params.timestamp`** — *latent only, not
  reachable*. The guard is `params.timestamp === undefined` (`verify.ts:769`), so a
  present-but-empty string would skip the bound. The broadcast form emits only `text`, `value`,
  `fee_fraction` and `encoding` — no timestamp field — and `composeBroadcast` supplies the default
  itself, so `params.timestamp` is never `''` today. Worth tightening to `== null || === ''` if that
  form ever gains the field.
- **`normalize.ts` mpma block** — *no exploitable finding*. A length mismatch between the assets and
  quantities CSVs skips normalization silently, but the MPMA page throws on mismatched lists before
  compose, and `packMpmaFromParams` returns null on the same condition, so the outcome is a clean
  error rather than a mis-scaled quantity. A blank CSV element (trailing comma) fails at the asset
  lookup with a clear message.
- **General false-agreement surfaces in the packers** — *reasoned, not exhaustively tested*. Byte
  equality cannot false-agree by construction: matching bytes mean an identical message. The
  residual risk is the opposite direction — a param the packer does not model causing a mismatch on
  a legitimate transaction (blocked, not signed) — plus the `Observed` borrows, which items 5 and 4b
  cover. This is the one area that would still benefit from a fresh adversarial pass.

**Operational note for re-running any of this:** subagents in this harness are blocked from writing
report files, and all three of tonight's agents stalled trying. Require the report as message text.
