# Latest-main translation review — 2026-09-20

PR #405 integrates main through `da63b07c` (PRs #412, #414, #415, #417 and
#418). This pass compares that main revision with the previous localization head,
`52fa69f5d00c8af6b9bf096ac9f657e6e300d259`. It adds 94 messages and removes three
obsolete messages, bringing each of the six packaged catalogs to 2,047 entries.
The [change record](main-integration-2026-09-20.json) includes the new text,
removed keys, catalog hashes and browser scene inventory.

## Coverage and wording

- ZELD balance, rewards, hunting settings/progress, send, move-to-small-output,
  review summaries, signing status and known actionable errors are localized.
  Japanese uses 探索; Simplified Chinese uses 搜寻; Traditional Chinese uses 搜尋.
  ZELD, ZeldHash, txid, BTC and sat units retain their technical identities.
- Whole sentences carry the amount, elapsed time, output count and result. Japanese
  may reorder substitutions. Transaction drafts and wire amounts remain canonical;
  display formatting never feeds the transaction builder.
- Dispenser and fairminter pagination has translated loading, failure, retry and
  empty states. The complete dispenser inventory loading/error state still blocks
  signing, and BTC send's verified dispenser-payment label is translated.
- ZELD approval warnings carry a structured code/count across the background/UI
  boundary. Translation preserves the original severity, blocking decision and
  fallback diagnostic. Known local ZELD errors translate at the UI boundary;
  unknown upstream/internal diagnostics retain their original text.

## Layout and flow

The browser gallery exercises nine scenes per surface in Japanese, Simplified
Chinese, Taiwan Traditional Chinese and Hong Kong Traditional Chinese. It uses the
actual 350x600 popup and 520x760 sidepanel entrypoints, scrolling the internal
content area rather than increasing popup viewport size. It checks control and
horizontal overflow, resolved placeholders, invalid drafts, Max, locally composed
send/move reviews and fairminter retry. Authored network fixtures prevent transaction
submissions; the gallery does not click signing or broadcasting controls.

Representative screenshots were visually inspected. The longer Japanese guidance
uses normal vertical scrolling. ZELD summary/progress rows wrap where needed, and
the review Back button now reserves enough width to avoid splitting 戻る across
two lines. Review amounts and primary actions remain readable.

## Validation

- 696 focused unit tests pass across 49 files; the review-footer follow-up also
  passes its six existing tests.
- 16 packaged browser regressions pass: six native-language startup/lock/unlock
  journeys, two BTC dispenser-payment verification cases, four complete-list and
  pending-balance cases, three dispenser pagination/retry cases and API ordering.
- All four latest-main locale galleries pass: 72 scenes and 118 scroll captures
  across the two surfaces. The final run uses the rebuilt footer layout and asserts
  no unhandled page errors or transaction write requests.
- TypeScript, lint within the existing warning budget, catalog/placeholder checks
  and the Chrome production build pass.

## Limits

This is an AI contextual translation and representative visual review, not
native-speaker editorial signoff or exhaustive review of every UI state. Machine
provenance remains unchanged. The existing generated `Wallet 1` / `Address 1`
names are a separate known gap: they are persisted names, not new strings from
these main commits. This integration does not rename stored wallets or addresses.
The previously discussed Rare Pepe gift-card detection and warning are unchanged.

Follow-up: the [default-name display change](../README.md#default-wallet-and-address-names)
resolves that name-display gap without altering storage. The counts and hashes in
this integration review describe its original revision, before those three messages.
