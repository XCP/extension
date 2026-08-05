# Red-team pass — findings and fixes (uncommitted)

Autonomous review of the 0.6.0–0.6.2 surface. Four parallel research agents (numeric, decoder
robustness, verification fail-open, provider trust boundaries) plus direct review. **Every finding
below was verified against source by hand** — agent claims and PoCs were treated as leads, not
truth, and several were re-derived from the code before any change.

## Protocol principle that scopes all of this
Verified in core, not assumed: `protocol.enabled()` is `block_index >= enable_block_index` with no
deactivation path (`lib/parser/protocol.py`), and `taproot_support` activated at mainnet block
**902000** (`protocol_changes.json`), long past. Features turn on at a height and never turn off, so
in the present every compose is CBOR with modern address packing. **Legacy encodings are therefore
not a compatibility burden to design around — they are only what an attacker might craft.**
(Nuance, also from source: core's *unpack* still falls back to legacy when CBOR parsing fails, so
legacy is never produced by a legitimate composer but can still be parsed if someone crafts it.)
Practical split:
- **Composer verification path:** assume present-day encoding. Do not add complexity to accommodate
  legacy quirks; the API's response is always CBOR.
- **Dapp-supplied transaction display:** must match what core does with the bytes, since an attacker
  chooses them. This is why decode precedence is pinned by `encoding-ambiguity.test.ts`.

## The pattern these releases have been fixing
Two moves, over and over: **(1) trust only what a signature cryptographically commits to, never
what the API/dapp asserts; (2) treat "unknown/unchecked" as unknown, never as safe.** Every finding
here is another instance of one of those. False-negatives (a substituted value that verification
*passes*) rank above false-positives.

---

## IMPLEMENTED — verified, tested, uncommitted (5 fixes, 9 files)

### 1. CRITICAL — best-effort PSBT signing signed a paired address's UTXO with no permission check
`src/utils/blockchain/bitcoin/psbt.ts`
When a dapp omits `signInputs`, the paired-address permission gate (`providerService.ts:799`, all
inside `if (signInputs !== undefined)`) is skipped, and `signPSBT` best-effort-signs **every** input
the key can sign. Counterwallet/Freewallet legacy and SegWit addresses are one key in two encodings
(`address.ts:174-181`, both `m/0'/0`), so the active key signs the paired UTXO. The approval screen
drops that input from pricing (different address than active), so it shows a benign headline while a
~1 BTC paired UTXO is signed under `SINGLE|ANYONECANPAY` and detached.
**Fix:** in best-effort mode, sign only inputs whose prevout script attributes to the active
address (`encodeAddress(pubkey, addressFormat)`); skip anything else, including undecodable scripts
(fail closed). Strictly subtractive — can only sign fewer inputs, never more. Signing a paired
address now requires the explicit `signInputs` path, which alone gates on paired-address permission.
Test: `psbt.test.ts` "best-effort mode signs only the active address, not a paired same-key address".

### 2. CRITICAL — a plaintext OP_RETURN decoy shadowed a multisig-encoded sweep (regression I introduced)
`src/utils/blockchain/counterparty/unpack/opReturn.ts`
My earlier `extractPayloadFromOutputs` unification carried a "plaintext CNTRPRTY OP_RETURN first"
branch into the dapp sign paths. counterparty-core *always* ARC4-decrypts, so a plaintext OP_RETURN
is garbage to the node — it proceeds to a multisig payload. An attacker pairs a benign plaintext
decoy with a real multisig sweep: the wallet surfaced and blessed the decoy, the sweep block was
bypassed, and the network executed the sweep.
**Fix:** never read plaintext — always ARC4-decrypt each OP_RETURN, then scan multisig, matching
core exactly. Tests: decoy-does-not-shadow-sweep (`multisig-encoding.test.ts`); plaintext-not-read
(`arc4-roundtrip.test.ts`).

### 3. CRITICAL — a single-destination send answered with an MPMA verified as valid
`src/utils/blockchain/counterparty/unpack/verify.ts`
`verifyMultiSend` bailed on an empty destination list with a bare `errors.push` — bypassing
`criticalMismatches`, from which `valid` is derived — so a compromised API could answer a plain send
with an MPMA paying the attacker and it read as verified.
**Fix:** the bail records a real `addMismatch(...,'critical')`, and `valid` now also requires
`errors.length === 0` as a backstop against any future direct-errors-push desync (provably cannot
reject an otherwise-clean transaction, since `addMismatch` keeps the two in sync). Test strengthened
in `verifyMultiSend.test.ts` to assert the critical mismatch, not just a non-empty error string.

### 4. HIGH — issuance lock / reset went unchecked whenever the form omitted them
`src/utils/blockchain/counterparty/unpack/verify.ts`
`if (params.lock !== undefined && params.lock === true)` left an API-injected lock/reset unchecked
when the request omitted the field (update-description, transfer-ownership submit neither). A
description edit could be answered with a lock+reset issuance — supply frozen, holders wiped.
**Fix:** one-sided comparison against the safe default of `false`, so an injected lock/reset is
always flagged. Tests: injected lock flagged, injected reset flagged, honest plain issuance still
accepted (`cbor-messages.test.ts`).

### 5. HIGH — subasset name decode is O(n²) on an unbounded CBOR byte string (popup DoS)
`src/utils/blockchain/counterparty/unpack/messages/issuance.ts`
The legacy path caps the compacted name at one length byte (255); the CBOR path caps nothing. A
~250 KB name (reachable via multisig within the 1 MB param cap) folds into one bigint and hangs the
popup's main thread for minutes with no cancel.
**Fix:** reject > 255 bytes before the fold; the unpacker's caller treats the throw as a failed
decode (fail closed). 255 matches what the legacy encoding can express.

---

## DOCUMENTED — verified, NOT implemented (reason + recommended fix), by priority

### HIGH
- **Output-destination verification gap (agent C, verified).** Destinations that live in transaction
  *outputs* rather than the OP_RETURN are never verified: BTC sends (no OP_RETURN at all), `dispense`,
  `btcpay`, legacy type-0 `send` (`verify.ts:241` guard silently skips — `SendData` has no
  `destination`), and issuance `transfer_destination` (`verify.ts:535` is an empty `if`). The review
  screen echoes `apiResponse.result.params`, so a malicious API pays someone else while displaying
  the requested address. **Not done:** architectural — needs output decoding + destination matching
  wired into `composer-context` and both sign paths; done carelessly it breaks legitimate BTC sends.
  This is the **highest-value remaining fix** and wants a deliberate design pass.
- **No independent fee check on the two dapp sign paths (agents A + D, verified).**
  `checkTransactionFee` runs only in the compose flow (`composer-context.tsx:347`); the dapp
  sign paths trust `vin.prevout?.value` and display the fee with only an absolute >0.1 BTC warning.
  A hostile dapp/API can show a benign fee on a drain. **Recommended:** call `checkTransactionFee`
  (userFeeRate null → absolute cap) in `useSignPsbtRequest`/`useSignTransactionRequest` before
  enabling Sign, `signaturesCommitToInputValues` from the address format, skip when unfunded.
  **Not done:** touches two hooks + async integration; wanted your awareness of the behavior change
  (legacy dapp signs now need a reachable explorer) first.
- **Dispenser `open_address`/`oracle_address`/`status` unchecked when omitted (agent C, verified —
  same class as fix #4).** `verify.ts:386-407` uses `if (params.x && data.x)`, so an injected
  `open_address`/`oracle_address`, or a `status` the request never set, is skipped — a dispenser can
  be created on the attacker's address, funded by the user's escrow. **Not done:** the correct
  one-sided fix needs to know what a *normal* dispenser's `data.openAddress`/`status` unpack to, or
  it re-introduces false positives (the 0.6.2 lesson). Quick to finish once that default is confirmed.

### MEDIUM
- **Unattributable input value flips the headline to "You receive" (agent D).** `money-movement.ts`
  excludes an input with an undecodable address from `spent` (`incomplete=true`), so `net≥0` renders
  "You receive N BTC" for a draining tx. Recommend counting an unattributable input into `spent`, or
  suppressing the headline when `incomplete`.
- **Signed bytes ≠ reviewed bytes in `xcp_signTransaction` (agent D).** `transactionSigner.ts`
  rebuilds the tx discarding version, nLockTime and every nSequence (hardcodes `0xfffffffd`), so the
  displayed txid and timelock/RBF semantics differ from what's signed. Recommend carrying
  `parsedTx.version`/`lockTime` and each input's `sequence`.
- **`fieldVerification: 'type-only'` computed but never surfaced (agent C).** dividend, fairmint,
  broadcast, attach, detach, btcpay, move reach the no-field-verifier branch and are shown identical
  to a fully verified tx (a dividend's per-unit quantity can be 1000× off). Recommend surfacing it,
  or adding the missing verifiers.
- **PSBT approval trusts dapp-declared `signInputs` addresses as "yours" (agent C).** Outputs to a
  dapp-named address get classified as change (suppressing the external-send warning). No fund loss
  (the signer rejects a foreign address), but the screen is the trust anchor. Recommend intersecting
  `signInputs` keys with wallet addresses before using them as "mine".
- **Broadcast text truncated and never cross-checked (agent B).** `broadcast.ts:112-125` guesses a
  Pascal-length prefix and drops the tail; `verifyBroadcast` never compares `text`. A signed
  broadcast can publish content the user didn't read. Recommend reading the remainder as text and
  comparing it.
- **Non-dust unresolvable-address outputs escape the suspicious-output check** (`transactionSafety.ts:161-175`) — dropped instead of flagged.
- **`SAFE_MESSAGE_TYPES` includes drain-capable types** (detach/attach/dividend/issuance-transfer) shown without their destination.
- **Unknown fee rendered as 0** (`useSignTransactionRequest.ts` fee fallback; `psbt.ts:403`), suppressing the high-fee warning.

### LOW
- Subasset issuance compares numeric asset id vs longname (`verify.ts:491`) — an availability bug today (blocks legit subasset issuance).
- Order price ratio 1e8× off in the local-unpack fallback (`transaction/approve.tsx:106`); `normalizeQuantity` renders unknown-divisibility amounts raw (`txActionInfo.ts:54`).
- Legacy SegWit marker renders unspendable addresses as plausible `bc1…` (`address.ts:266`).
- `hexToBytes` accepts partially-invalid hex (`binary.ts:182`); `valuesEqual` boolean coercion can equate `true`/`'false'` (latent, `verify.ts:146`).
- Replay store keyed by the wrong txid and worker-memory-only (`providerService.ts:971`) — recording is correctly scoped, impact limited.
- Message-signing screen shows no warning for bidi/zero-width characters (display spoofing).

---

## CLEARED — checked, no issue (so effort isn't re-spent here)
`cbor.ts` (every length bounded before slice; depth cap on the only recursive type; no unbounded
loop/alloc — agent B ran the attacks); `multisig.ts` (matches core's `decode_checkmultisig`
byte-for-byte); `BinaryReader` (every read bounds-checked); `committedOutputIndices` (intersection
logic correct, covered by `mixed-sighash.test.ts`); sighash enforcement is on the value signing
actually uses; legacy prevout binding (`allowLegacyWitnessUtxo:false` + `@scure` txid check);
`validateSignInputs` fail-closed; `addressesEqual` sound; message-signing crypto domain-separated
(magic prefix + BIP-322 tagged hash); `feeVerification.ts` and `numeric.ts` numerically sound;
`computeMoneyMovement` classification errs conservative in every branch.

---

## ADDENDUM 2026-08-03 (post-#215/#216): the subasset borrow's griefing edge, and its guard

The `Observed` borrow of a subasset's numeric asset id (PR #215 initial issuance; extended to
reissuance alongside the transfer-ownership packer) has a bounded griefing vector the original
safety comment under-weighted: a substituted id naming a *different numeric asset the user owns*
(with matching divisibility) is not consensus-rejected — the operation lands on that asset instead.
For issue/describe the wrong outcome is recoverable (destroy the supply, rewrite the description).
For **lock, reset, and ownership transfer it is permanent against the wrong asset.**

Verified context before judging severity:
- The field-comparison fallback is **equally blind** — it compares the longname the user typed,
  which the compacted bytes echo faithfully, and never sees the numeric id. No verifier without an
  independent ledger view can detect the substitution. The borrow therefore never made anything
  *worse*; the vector predates it and survives declining.
- The range guard limits targets to numeric assets (id > 26^12), i.e. other subassets/numerics the
  user owns — named B26 assets cannot be targeted this way.
- Attacker take is zero (griefing only), and it requires a malicious compose response plus the user
  owning a matching-divisibility numeric asset.

**Guard implemented:** the borrow refuses `lock`, `reset`, and `transfer_destination` — those flows
stay on the field fallback (no blinder, but byte equality does not sign off on them). Issue and
describe keep full byte equality. Closing the vector *properly* requires an independent ledger view
(second API source or local index) or local composition — folded into the local-compose decision.
