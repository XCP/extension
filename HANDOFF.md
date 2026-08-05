# Handoff — transaction verification architecture

Working notes for continuing the verification work. Untracked on purpose: this is session state, not
project documentation. The durable material lives in ADR-019 (`verify.ts`), AUDIT.md, and the module
comments referenced below.

## Where things stand

- **PR #214 merged** (squash commit `3f08d7df`, 2026-08-03, all 39 checks green).
- **PR #215 merged** (squash commit `95e6cafe`, 2026-08-03, all checks green): step 3, broadcast +
  initial subasset issuance byte equality.
- **PR #216 open** (`harden/byte-equality-mpma`): MPMA byte equality, both wallet flows (dedicated
  page and the send form's multi-destination convenience). Findings worth keeping:
  - `composeMPMA` sent memos as `memos[]=`, which core's `query_params()` ignores — **MPMA memos
    never reached the API** and composes silently proceeded memo-less. Fixed: repeated plain
    `memos=` keys (core folds those into a list); a shared memo travels once as the whole-send
    `memo` param; mixed hex/text memo lists error loudly (core has a single `memos_are_hex` flag).
  - One distinct destination → nbits 0 → the count/index fields occupy **no bits**. bitstring
    4.1.4 (core's pin) appends nothing for `uint:0`; newer versions raise. Same lesson as cbor2:
    verify against the pinned version. This is the dominant on-chain MPMA shape.
  - Core silently drops memos it cannot encode (>63 bytes, odd hex) via a bare `except`; the
    packer declines those instead of reproducing the drop.
  - MPMA quantity normalization moved from the MPMA page into `normalizeFormData` so the packer
    sees the base units the API receives.
- **Branch `harden/issuance-transfer-and-borrow-guards`** (stacked on the MPMA branch): ownership
  transfers now byte-verify (the message is byte-for-byte a reissuance — core carries the new
  owner only in an output, which the output policy pins; confirmed by a live oracle case), and
  subasset reissuances (description updates) byte-verify under a borrowed asset id. The subasset
  borrow now refuses `lock`, `reset` and `transfer_destination` — irreversible if a substituted id
  landed on a different numeric asset the user owns — tightening #215's initial-issuance borrow
  retroactively. The griefing analysis is an addendum in RED-TEAM-FINDINGS.md; the full fix needs
  an independent ledger view, folded into the local-compose decision.
- Local: `tsc --noEmit` clean; counterparty unit suite passing (638); both oracles run against
  `api.counterparty.io:4000` — 49/49 including the new broadcast and subasset cases; E2E
  `compose/broadcast/index.spec.ts` and `compose/issuance/index.spec.ts` run locally, one at a
  time, both green.
- Step 3 findings worth keeping:
  - cbor2's **default** (not canonical) float encoding is what core uses: every finite float is an
    8-byte double (`0xfb`). Verified empirically under cbor2==5.9.0, core's pin.
  - A new subasset's numeric asset id is `random.randint` at compose time — server-chosen, so it is
    borrowed via `Observed` with a numeric-range guard. The safety argument is in
    `packSubassetIssuance`'s header (collision with someone else's asset is consensus-rejected;
    collision with the user's own degrades to a self-reissuance).
  - Subasset CBOR flags are packed as **ints** (`1 if divisible else 0`); the standard layout uses
    booleans. Byte-level difference, easy to get wrong from memory.
  - The broadcast timestamp is stamped by `composeBroadcast` from the wallet's own clock and never
    reaches the packer's params, so it is borrowed from the decoded message, bounded to ≤ now + 1h
    (future timestamps settle a feed's bets early). `verifyBroadcast` applies the same bound on the
    fallback path.
  - Subasset **reissuance** (standard layout, ledger-resolved asset id) and ord-inscription
    composes are still declined to the field-comparison fallback, deliberately.

## The model, in one paragraph

Verification used to compare a request against a composed transaction field by field. That shape
fails open: a field nobody enumerated is unchecked, so anything unanticipated reads as fine. It is
now structural, in four layers, matching what counterparty-core asserts about its own output in
`check_transaction_sanity`:

1. **Message** — rebuild it locally and compare the whole thing (`pack/messages.ts`). One comparison
   covers every field. Ten compose types can be rebuilt; anything else returns `null`, which means
   "cannot verify this way", never "verified".
2. **Outputs** — every output must be explained as the data output, an address the request names, or
   change; anything else rejects the transaction (`outputPolicy.ts`).
3. **Inputs** — values are always resolved independently, never read from the response
   (`feeVerification.ts`).
4. **Display** — the review screen renders from the decoded transaction, not from the response's echo
   of the request (`composer-context.tsx` → `state.decodedMessage`).

## Working agreements that earned their place

These came from things that went wrong. They are worth keeping.

- **Check counterparty-core before claiming anything about the wire format.** Clone it and grep;
  do not rely on recall. Every format claim asserted from memory in this work turned out wrong, and
  every one that was checked either confirmed cheaply or found a defect. See the
  `counterparty-core-reference` note in memory for where things live.
- **Never say tests pass without running the suite that covers the change.** Including E2E, locally,
  one spec file at a time (see CLAUDE.md) — a unit run will not catch an interaction between a new
  condition and an existing screen's contract.
- **Let the oracles judge bytes.** Do not add a packer the oracles cannot verify. An unverified
  packer fails closed on every transaction of its type, which is worse than falling back to field
  comparison.
- **Match the fix to the finding.** Two controls were made stricter than the evidence supported and
  both had to be walked back: byte equality briefly treated an informational difference as fatal,
  and the fee-rate check briefly blocked instead of warning. Tightening past the finding creates
  false positives, which are their own failure.
- **A decoder must not invent data.** The fairminter unpacker substituted `"text/plain"` for an
  absent MIME type, which would reject honest transactions the moment anything compared that field.

## Priorities queue — worked through 2026-08-03

`PRIORITIES.md` (untracked, repo root) holds the severity-ranked queue and its current status.
Everything actionable landed the same day, in PRs #221-#226:

- **Inscriptions now work** (#221). They had three independent defects: a malformed request that
  made core reject every compose, no message verification, and a reveal transaction the wallet
  never broadcast. Verified rather than exempted — the ord envelope is rebuilt locally and the
  commit address derived from it, so a substituted inscription still fails closed.
- **The provider approval screen parses transactions locally** (#223) instead of rendering the
  untrusted API's decode, which also made the message cross-check genuinely independent.
- **The wallet no longer overstates what it checked** (#222) or what a transaction costs (#224),
  and screens show the destination the transaction encodes rather than the one echoed back (#226).

What is left (3c, 3d, 3e) are policy calls about whether to start blocking things the wallet
currently permits, plus the Trezor dependency question. None are trust-boundary bugs.

## Next, in order

1. **One real compose and one real signing flow against a live node.** E2E mocks the API, so byte
   equality has never met a genuine compose response end-to-end in the extension itself. The
   compose oracle now covers the message bytes against a live node (including broadcast and
   subasset issuance), but the full flow needs a funded wallet and remains the one gap the oracles
   cannot close.
2. **Land PR #216** (MPMA byte equality — written, oracle-validated, E2E-tested).
3. **Decide on composing transactions locally.** Mainstream Bitcoin wallets build transactions
   themselves and so have nothing to verify. It is the only approach that removes this problem
   rather than bounding it, and it is a real design decision rather than a task.

## Things to know before changing anything

- **Byte equality is fail-closed.** If a packer disagrees with core, that compose type stops working
  entirely. The oracles are the mitigation and they run nightly — verify the nightly workflow still
  executes them after any change to `pack/`.
- **The output policy is strict.** Every compose type was audited against core's `compose()` return
  values; the table is in `outputPolicy.ts`. A compose type with an implicit payee that is not in
  that table will be rejected. Burn and BTCPay are the two handled specially.
- **Oracles need a node.** `COUNTERPARTY_API_URL=https://api.counterparty.io:4000`. Without it they
  skip silently. They are wired into `.github/workflows/nightly-tests.yml`.
- **Two research documents sit untracked** in the repo root: `LOCAL-COMPOSE-FEASIBILITY.md` (the
  local-composition analysis and wallet comparison) and `RED-TEAM-FINDINGS.md` (the audit log). Kept
  out of version control deliberately — the second catalogues open items and does not belong in a
  public repository. Read them for background; do not commit them.

## File map

| Area | Path |
|---|---|
| Threat model and architecture (ADR-019) | `src/utils/blockchain/counterparty/unpack/verify.ts` (header) |
| Local message construction | `src/utils/blockchain/counterparty/pack/messages.ts`, `pack/cbor.ts` |
| Oracles | `src/utils/blockchain/counterparty/pack/__tests__/coreOracle.test.ts`, `onchainRoundTrip.test.ts` |
| Output accounting | `src/utils/blockchain/counterparty/outputPolicy.ts` |
| Fee and input values | `src/utils/blockchain/bitcoin/feeVerification.ts` |
| Compose flow wiring | `src/contexts/composer-context.tsx` |
| Approval screens | `src/pages/requests/psbt/approve.tsx`, `src/pages/requests/transaction/approve.tsx` |
