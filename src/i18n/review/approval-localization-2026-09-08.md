# Approval localization evidence — 2026-09-08

This records the bounded PR400 approval and compose-diagnostic pass on base
`7734dd86`. The accompanying
[`approval-localization-2026-09-08.json`](approval-localization-2026-09-08.json)
lists **181 fragment keys plus 28 reused safety keys**, their context, source
groups, positional-template hashes and machine provenance. The catalogs remain
the canonical message text; the manifest is review evidence, not another runtime
catalog.

The historical [`critical-journeys-2026-09-07.json`](critical-journeys-2026-09-07.json)
and [`terminology-2026-09-08.md`](terminology-2026-09-08.md) are preserved. Their
recorded gaps describe those earlier snapshots. This pass addresses the listed
provider/action, local compose-verification and swap-outcome messages; it does
not retroactively change earlier acceptance results.

## Scope and provenance

| Source group | Keys | Reviewed context |
| --- | ---: | --- |
| Action descriptions | 129 | Approval actions, summary fields and existing protocol facts |
| Provider review | 29 | Verification/retry errors and shared approval controls |
| Compose diagnostics | 15 | Independent fee checks, recipient outputs and recovery public keys |
| Structure diagnostics | 5 | Missing attachment output and legacy source-UTXO mismatch |
| Swap outcomes | 3 | Book partial fill, below-smallest-unit output and unavailable liquidity |
| Reused safety messages | 28 | Existing warnings rendered after background serialization |

English, Japanese, Simplified Chinese, Taiwan Traditional and Hong Kong
Traditional fragment messages were compared with the actual catalogs after
expanding Chrome placeholders. All 181 keys matched; every non-English key
remained marked `machine`. The 28 reused safety keys also retain machine status.
Generic `zh` remains the Simplified fallback mirror, not an additional independent
language review. Shared Traditional wording does not establish a distinct Hong
Kong convention.

This is AI contextual review, **not native-speaker certification**, human
approval, a whole-catalog audit or proof that every language fits every screen.
Previously researched Zaif, Uniswap, UniSat, OneKey and OKX references are retained
in the historical terminology note with their original limits; this pass does
not claim a new external terminology review.

## Protocol meanings checked before changing text

The locally cloned Counterparty Core revision is
`67e10db3ee266068c1effc4e83653df39ace5ca8`. Paths below are beneath
`counterparty-core/counterpartycore/`; exact line references are in the manifest.

- `lib/messages/attach.py::parse` rejects an explicit destination output that
  does not exist. That invalidates the attachment, not the underlying Bitcoin
  transaction. The warning says that the Bitcoin fee would still be paid **if
  signed and confirmed**.
- `lib/messages/utxo.py::validate/parse` handles legacy ID100 address-to-UTXO
  and UTXO-to-address transfers. It checks the source UTXO's owning address
  against `tx.source`; it does not universally require that UTXO to appear in
  the Bitcoin inputs. The wallet keeps its existing, stricter input-membership
  signing block. The localized warning describes that observed mismatch and
  does not falsely state that Core always rejects the legacy message.
  `lib/messages/move.py::compose/move_assets` is the separate implicit movement
  path: actual spent UTXOs move their attached balances without a Counterparty
  message. Japanese `tx_action_utxo_move` therefore uses `UTXOのアセット移転`,
  avoiding the over-specific “between UTXOs.”
- `lib/messages/versions/mpma.py::validate_compose` checks duplicate
  **asset/destination pairs**. One address may receive several assets. Both
  `tx_action_send_one_recipient` and `tx_action_send_recipients` describe transfer
  entries: JA `送金明細：$1件`, CN `转账明细：$1项`, TW `轉帳明細：$1項`,
  HK `轉賬明細：$1項`. The existing entry-count behavior is unchanged.
- `lib/api/composer.py::get_source_pubkey/prepare_multisig_output/prepare_outputs`
  and fee/input selection distinguish recoverable BTC in data outputs from
  protocol fees. “Recovery key” here means the **public key** controlling that
  small Bitcoin output, not a recovery phrase.
  `lib/parser/gettxinfo.py::get_tx_info_new` joins destination outputs before
  message data. `issuance.py` uses the parsed destination for ownership
  transfer; enhanced-send and MPMA recipients instead reside in their payloads.
  UI diagnostics preserve the exact amounts/addresses and distinguish a single
  wrong output from multiple combined destinations.
- `lib/api/queries.py::get_pool_quote` and
  `lib/ledger/markets.py::compute_pool_output/compute_pool_fill` distinguish
  incomplete order-book execution, output below the asset's smallest integer
  unit, and returned input caused by pool rounding. The three existing quote
  outcomes, arithmetic and API-message precedence remain unchanged. A quote
  describes current state, not guaranteed execution after confirmation.

## UI boundary and verification

Known local findings carry stable codes and explicit facts through background
serialization. The approval/compose UI translates those facts in its current
language. No translated string is parsed back into a decision or amount. Warning
severity, blocking, ordering, retry eligibility and exact outpoints/indexes are
preserved. Unknown/unstructured and API diagnostics retain their original text;
those may still be English.

The real Japanese gallery exposed an English destruction warning whose text had
been captured in the background. The foreground now translates all 28 existing
safety messages from typed warning facts. Regression coverage creates English
analysis, serializes it, then renders it in JA/CN/TW/HK, retaining BTC amounts,
message-type identifiers and decisions. Counts needed only for presentation use
the current number preference; no composed values change.

Recorded focused results:

- Structure findings, analysis and translated warnings: 57 tests passed before
  the additional background/foreground regression.
- Final safety/approval/sign-analysis selection: 102 tests passed across
  `approval-warnings`, `transactionSafety`, `transactionSafety.unclassified`
  and `signRequestAnalysis`. Biome passed for the three boundary-fix files.
- Compose fee/output-policy/UI/context selection: 84 tests passed; the 19
  composer-context tests were rerun after its render-memo correction.
- Swap outcome selection: 57 tests passed, comprising 33 actual-form
  localization cases and 24 core pool cases.
- Release-owner combined focused run: 468 tests across 23 files passed, with
  compile, lint and production build passing at this snapshot.

The approval gallery uses actual saved locale preferences and localized
assertions for raw/PSBT send, order, pool, blocked and warning states, with an
optional failed-lookup/retry scenario. It captures compact and expanded
diagnostic views, including the complete foreign outpoint. It uses fixtures plus
some read-only upstream requests; it is not fully offline and does not sign or
broadcast. The release owner completed and visually inspected the Japanese
seven-scenario gallery (14 raw/PSBT cases) plus failed-lookup/retry coverage after
the warning/header fixes. Chinese variants and side-panel checks are still in
progress at this snapshot. Their final results and full release checks are
recorded separately; this note does not claim their completion.

## Maintaining this record

The five `pending-*.json` handoff files were consolidated and removed after the
parallel audit. Their complete key scope, descriptions, Core context and
normalized-file hashes are captured here. The action audit's three corrections
are included and catalog comparison is clean. Historical review files remain.

Message hashes cover UTF-8 templates after named Chrome placeholders expand to
their positional contents. A changed message requires a contextual re-review
and an updated snapshot; matching key names alone are insufficient. Future
changes should add a dated review record rather than relabel old machine work as
human-reviewed or silently overwrite historical evidence.
