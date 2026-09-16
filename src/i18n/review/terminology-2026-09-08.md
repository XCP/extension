# Bounded terminology review — 2026-09-08

This resumes the saved PR400 review after current main, including PR398/399, was
integrated. It records selected key decisions, not a new approval of all
181 entries. `critical-journeys-2026-09-07.json` remains an unchanged historical
hash manifest. Implementation and browser validation are reported separately in
PR400; this terminology note does not stand in for those checks.

## Address labels

Use compact regional qualifiers while retaining the recognizable SegWit name:

| Key | Japanese | Simplified Chinese | Taiwan Traditional | Hong Kong Traditional |
| --- | --- | --- | --- | --- |
| `address_type_native_segwit` | ネイティブSegWit | 原生 SegWit | 原生 SegWit | 原生 SegWit |
| `address_type_nested_segwit` | ネスト型SegWit | 嵌套 SegWit | 巢狀 SegWit | Nested SegWit |
| `address_type_legacy` | レガシー | 传统 | 傳統 | 傳統 |

Preserve `P2WPKH`, `P2SH-P2WPKH`, `P2PKH`, `P2TR`, `Taproot`, `CounterWallet`
and `FreeWallet` exactly. Display labels must not affect derivation or type IDs.

Primary evidence:

- [OneKey Japanese address guide](https://help.onekey.so/ja/articles/11461370-btc%E3%82%A2%E3%83%89%E3%83%AC%E3%82%B9%E3%81%A8%E3%81%9D%E3%81%AE%E4%BD%BF%E7%94%A8%E6%96%B9%E6%B3%95)
  supports ネスト型SegWit and レガシー; [Binance's Japanese SegWit FAQ](https://www.binance.com/ja/support/faq/detail/0a6fcbc99a87424481c08bd894601759)
  confirms ネイティブSegWit and the corresponding nested/legacy vocabulary.
- [OneKey Simplified derivation guide](https://help.onekey.so/zh-CN/articles/11461299-%E9%92%B1%E5%8C%85%E6%B4%BE%E7%94%9F%E8%B7%AF%E5%BE%84)
  supports 原生, 嵌套 and 传统; [its Taiwan guide](https://help.onekey.so/zh-TW/articles/11461299-%E9%8C%A2%E5%8C%85%E8%A1%8D%E7%94%9F%E8%B7%AF%E5%BE%91)
  supports 原生, 巢狀 and 傳統.
- [OKX Simplified wallet instructions](https://www.okx.com/zh-hans/help/how-to-use-okx-wallet-to-participate-in-brc-20)
  and [Traditional instructions](https://www.okx.com/zh-hant/help/how-to-use-okx-wallet-to-participate-in-brc-20),
  section 3, distinguish the same address types with fuller localized names.
  Existing fuller import/approval labels remain valid; a compact selector need
  not repeat the full translated expansion of SegWit.
- [OneKey's actual wallet settings](https://github.com/OneKeyHQ/app-monorepo/blob/12581206d25a6ea572efdb340464e92acbf2b9e9/packages/kit-bg/src/vaults/impls/btc/settings.ts#L34)
  retain English address-type names. No inspected source established a distinct
  Hong Kong term for Nested; retaining English there is conservative. Shared
  Traditional wording is not proof of a separate Hong Kong convention.

## Japanese price-impact consistency

Keep each sentence's meaning and `$1` placeholder; replace only the repeated
term 価格影響 with 価格インパクト:

| Key | Selected value |
| --- | --- |
| `pool_slippage_input_set_from_the_quote_s` | 数量を入力すると、見積もりの価格インパクトから設定されます。 |
| `pool_slippage_input_using_matched_to_this_trade` | この取引の価格インパクトに合わせて $1% を使用しています。 |

The shipped Launchpad Japanese catalog uses 価格インパクト for `Price impact`.
[Uniswap's pinned Japanese catalog](https://github.com/Uniswap/interface/blob/da6d36f71c4d2fd665b0aae1a052a4ffda917b31/packages/uniswap/src/i18n/locales/translations/ja-JP.json)
uses it in `swap.settings.routingPreference.option.default.tooltip`, verified
against [the matching English source](https://github.com/Uniswap/interface/blob/da6d36f71c4d2fd665b0aae1a052a4ffda917b31/packages/uniswap/src/i18n/locales/source/en-US.json).
This is consistency work, not a correction to compose behavior. The original
wording was understandable. Uniswap's separate `swap.priceImpact` key currently
means “Price difference”; key names alone are not terminology evidence.

## Swap route labels found during layout review

The quote details still contained literal “Pool,” “1 order” and “N orders.”
Reuse `common_pool` for a pool-only route and `swap_form_pool` for the mixed
“Pool + $1” label. Add two order-count messages:

| Key | English | Japanese | Simplified | Taiwan | Hong Kong |
| --- | --- | --- | --- | --- | --- |
| `swap_form_route_one_order` | $1 order | $1 件の注文 | $1 笔订单 | $1 筆委託 | $1 筆訂單 |
| `swap_form_route_many_orders` | $1 orders | $1 件の注文 | $1 笔订单 | $1 筆委託 | $1 筆訂單 |

These retain each catalog's existing order/order-book vocabulary. Format the
count with the saved number preference and translate during render. The quote
memo keeps unformatted display-price data so changing number format updates the
price without altering the quote, draft or hidden transaction inputs.

Focused actual-form tests cover the five route shapes in all five selectable
languages, same-quote language and number-format changes, and valid/invalid draft
preservation (27 cases). This is not browser-layout or full-CI acceptance.

The English `describeSwapQuoteOutcome` messages for partial fills, amounts below
the smallest output unit and unavailable liquidity remain a follow-up UI-boundary
translation gap. This change does not alter that helper, its classification or
math, and does not replace diagnostics returned by the API.

## Shared send headings

Reuse `common_destination` and `common_memo` for the visible send fields, and add
`common_destinations` for multiple recipients: Destinations / 送信先 / 接收地址 /
接收地址 / 接收地址. These match the existing singular catalog vocabulary. All
three input components update their labels without resetting recipient or memo
drafts, changing validation results or repeating asset-owner lookups.

## Retained meanings and review limits

- Retain token 数量/數量 and 受取数量/接收数量/接收數量. Do not copy generic
  monetary-amount wording merely because another app uses it. Uniswap's
  [Simplified](https://github.com/Uniswap/interface/blob/da6d36f71c4d2fd665b0aae1a052a4ffda917b31/packages/uniswap/src/i18n/locales/translations/zh-CN.json)
  and [Taiwan](https://github.com/Uniswap/interface/blob/da6d36f71c4d2fd665b0aae1a052a4ffda917b31/packages/uniswap/src/i18n/locales/translations/zh-TW.json)
  catalogs corroborate the existing 兑换/兌換 and 滑点/滑點 terminology.
- [Zaif Prime Desk](https://zaif.jp/crypto_otc_desk) supplies Japanese trading
  usage of スリッページ and 数量; [Zaif's explanation](https://zaif.jp/doc?lang=ja)
  has Counterparty context. Its OTC execution promises and
  [exchange fee schedule](https://zaif.jp/fee?lang=ja) are not our protocol rules.
- [UniSat's AMM explanation](https://docs.unisat.io/technical/brc20-swap-introduction/what-is-an-automated-market-maker)
  helps distinguish price impact from slippage, but its BRC-20 execution system
  is different. Preserve our pool-ratio tolerance wording, quote versus minimum
  output distinction, and separate network/protocol fees.
- Preserve confirmation/expiry wording and return of unfilled assets from the
  saved Counterparty review. Do not restore the next-block promise suggested by
  the old key `swap_review_immediately_or_cancels_next_block`, or borrow an EVM
  atomic-revert guarantee. Core evidence remains in the historical manifest.
- Input syntax and compose serialization stay independent of display locale:
  canonical ASCII digits and an allowed decimal point, with invalid drafts
  retained rather than rounded or reinterpreted.

Machine provenance remains in place. Existing protected translations are not
reclassified. These sources support terminology choices; they do not constitute
native-speaker certification, full catalog review or browser-layout acceptance.
