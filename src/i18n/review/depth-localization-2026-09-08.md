# Japanese and Chinese depth review — 2026-09-08

This follow-up starts at PR400 head `9293e9a3830b62cfab96fd2b892752c05567d8e7`.
It preserves that release candidate and records a bounded second pass. The JSON
beside this note contains the exact before/after entries, final message hashes,
original proposals, and reference sources. Final entries supersede proposals.
Existing historical review records are unchanged.

All non-English additions retain machine provenance. This is an AI contextual
review with code and browser checks, not native-speaker certification.

## Context and terminology

| Context | Decision |
| --- | --- |
| Recovery word list | Call it Recovery Phrase, リカバリーフレーズ, 助记词 / 助記詞. The reveal page returns the mnemonic, not an optional BIP39 passphrase. |
| Open dispenser | Use an operating state, not an imperative to open something. Japanese 稼働中; Chinese 营业中 / 營業中. Orders have a separate open-state key. |
| Give/get and unfilled order quantities | Name payment/receipt quantities and their unfilled amounts. Preserve each asset and its own units. |
| Price impact and review | Keep 価格インパクト consistent with Launchpad and the referenced Uniswap tooltip. Chinese review buttons describe review before signing. |
| Dispenser quantity | A quantity is per lot. One payment can buy several lots. Divisible and indivisible help retain their different input rules. |
| BTC order matching fee | Name the fee requirement on the BTC-paying order transaction. It is not the fee of the later BTCPay transaction. |
| Pending balances | Translate known pending reasons at render time without changing estimates, read cadence, or spendability. |
| Trezor failures | Translate finite local error codes. INIT_FAILED concerns starting the connection, not resetting the device. Unknown diagnostics remain verbatim. |
| History page and expiry duration | Reuse historical type labels rather than approval verbs; translate confirmation state and retained local failures. Localize compact approximate duration units without changing block thresholds, rounding, or saved values. |

Primary product references are the [Zaif order-book guide](https://zaif.jp/doc_orderbook_trading),
[Uniswap's pinned Japanese catalog](https://github.com/Uniswap/interface/blob/da6d36f71c4d2fd665b0aae1a052a4ffda917b31/packages/uniswap/src/i18n/locales/translations/ja-JP.json),
its [matching English source](https://github.com/Uniswap/interface/blob/da6d36f71c4d2fd665b0aae1a052a4ffda917b31/packages/uniswap/src/i18n/locales/source/en-US.json),
and its [Simplified](https://github.com/Uniswap/interface/blob/da6d36f71c4d2fd665b0aae1a052a4ffda917b31/packages/uniswap/src/i18n/locales/translations/zh-CN.json)
and [Traditional](https://github.com/Uniswap/interface/blob/da6d36f71c4d2fd665b0aae1a052a4ffda917b31/packages/uniswap/src/i18n/locales/translations/zh-TW.json)
catalogs. Launchpad's shipped catalogs provide cross-product consistency. The
earlier terminology note records the OneKey, Binance, and OKX address references.
Product vocabulary is evidence for wording; their execution promises are not
imported into Counterparty.

## Counterparty evidence

Checked the local Core clone at `67e10db3ee266068c1effc4e83653df39ace5ca8`.
Paths below are relative to `counterparty-core/counterpartycore/`.

- `lib/messages/order.py:449–477` records gated expiry and the order transaction's
  fee. Matching uses the provided/required fee accounting at lines 714–772.
  `lib/ledger/markets.py:316–327` expires an order after its recorded expiry block.
- `lib/api/verbose.py:494–563` enriches events from the original transaction.
  The formatter labels these as recorded state, follows updates targeting that
  order, and does not present the snapshot as a live order lookup. Unconfirmed
  decoding cannot establish a mined expiry. Raw updates discard older normalized
  fields; price inversion uses original quantities.
- `lib/messages/dispense.py:14,151` computes paid lots and caps output by remaining
  stock. The per-lot description does not change compose inputs.
- `lib/messages/versions/mpma.py:109–119,216–288` permits independent quantities
  per asset/destination and emits every `MPMA_SEND` entry. Totals use exact integer
  arithmetic per asset; unequal transfers no longer claim a uniform quantity.
- `lib/api/compose.py:957–969` currently exposes only the first destination per
  asset in the unpacked MPMA list. The history formatter therefore requires
  complete events or explicit legacy tuples, and reports unavailable details
  when only that incomplete projection exists. `mpma_send` now dispatches to it.

Core's historical enrichment can use current asset metadata even after a later
divisibility reset. That inherited limitation requires historical metadata; this
pass does not claim to solve it or add new lookups.

## Boundary and validation

Language defaults still follow the browser before onboarding and while locked.
Fiat is independent and defaults to USD. Display number formatting does not enter
the amount draft or compose contract. No SDK dependency, signing policy, API
acceptance gate, automatic retry, or device operation is changed.

Known API validation failures carry typed facts to the UI while retaining their
original diagnostic strings. Hardware RPC adds only validated vendor/code facts
for real `HardwareWalletError` values returned to trusted extension pages;
content-script callers retain the previous error contract. Provider numeric
codes, review-code precedence, raw unknown evidence, and mutation replay rules
remain intact.

Focused tests exercise retained errors, changed languages and number preferences,
unchanged requests and drafts, exact quantities, historical event selection, and
the actual MPMA dispatcher. The i18n checker now validates generated English
message contents, including placeholders, rather than only its key list.

Packaged checks use `browser-language.spec.ts`, `localized-journeys.spec.ts`, and
`localization-depth.spec.ts`. The last gallery uses fabricated read responses,
blocks transaction writes, and captures Japanese and all three Chinese variants
at 350, 360, and 1100 pixels. It opens the recovery menu without revealing secrets.
Execution results and the review ZIP belong in the PR validation record; merely
having these tests is not evidence that they passed.

Additional Launchpad languages and raw background marketplace bundle-proof
wording remain subsequent work. A pre-existing XCP daily-chart UTC/date display
issue in negative-offset time zones is also outside this pass. No store
publication or real-value/hardware transaction is performed here.
