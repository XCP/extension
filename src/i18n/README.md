# Localization consolidation (draft)

This branch preserves the catalogs and machine-review status from `localize-ja-zh`
at `bdd4a894340fee971afd51d41a7c310bb176b70a` and incorporates the amount-safety
changes from PR399. New Japanese and Chinese preference/safety messages remain
listed in `status/<locale>.json` as machine drafts. They have not received native
speaker or terminology review.

Settings saves three independent choices inside the encrypted keychain:

- Interface language: browser-resolved catalog by default, or English, Japanese,
  Simplified Chinese, Taiwan Traditional Chinese, or Hong Kong Traditional Chinese.
- Number/date format: follows the resolved interface language by default, with a
  separate saved override. This choice controls display only.
- Fiat price currency: retains the existing saved currency and USD default.

As with other encrypted settings, these preferences apply after unlocking that
keychain. The locked screen uses browser defaults. The extension's manifest name
also follows the browser, independently of the unlocked interface override.

Inputs and compose serialization never consult these preferences. Amount drafts
accept only canonical ASCII digits and a period when the field permits fractions;
invalid drafts remain visible and block submission. Display strings must never be
fed back into transaction inputs. The pinned SDK contract remains under
`core/amount-contract`, unchanged by localization.

Language changes re-render the active route in place. Inline composer render
callbacks return the real form element rather than becoming a new component type
on every render. This preserves drafts, including invalid ones, when preferences
change in another wallet surface. Navigating to a different composer pathname
still resets its transaction state.

`t()` supports Chrome's named placeholders as well as positional substitutions.
Adjacent positional values such as `$1$2` are invalid Chrome catalog syntax:
Chrome interprets `$1$` as a named variable. Those catalog entries use named
placeholders with positional `content` instead. The catalog checker validates
named references and compares expanded positional substitutions across locales.

Critical shared amount, fee, divisibility and inexact-fraction diagnostics use
stable codes translated at the UI boundary. Unrecognized API diagnostics retain
their original text. Exhaustive structured translation of protocol verification
blockers remains follow-up work; the draft is not a claim that every diagnostic
or module-initialized label supports live language switching.

Validation: focused unit/integration tests, catalog integrity, TypeScript, lint,
production build, and packaged Chromium tests for sequential invalid typing and
cross-window preference changes. No live transactions are composed or signed by
the browser regressions.

## Fiat coverage and data limits

USD remains the default for every interface language. Saved CNY, EUR, GBP, JPY,
CAD and AUD are independent overrides. Market tickers and dispenser price views
use the selected current BTC quote; current XCP estimates convert XCP/USD using
the BTC/selected-fiat to BTC/USD ratio. Missing quotes show no estimate. A pending
or late response in another currency cannot be relabeled as the current choice.
Current BTC statistics reuse a quote only within the existing ten-minute TTL;
a failed refresh returns unavailable. Expired statistics are never combined
with a fresh USD quote to infer FX. Direct USD spot reads also return unavailable
when all providers fail, without reusing a prior quote.
Current quote readers reject non-finite and non-positive prices before display
or conversion.
Send, dispenser and dispense review estimates explicitly include an approximation
mark and ISO currency code; the verified crypto quantity stays primary. Provider
approval cards and order/swap reviews generally show protocol asset units only.

BTC chart history requests the selected currency from CoinGecko, keyed by range
and currency. Non-USD data has no USD-only fallback; availability depends on that
provider. The BTC/XCP ratio uses two USD quotes so the fiat choice cannot change
its units. Changing the saved currency resets the BTC view before loading it.

XCP historical charts and historical summary statistics remain explicitly USD,
as supplied by the XCP history endpoint. This PR does not invent dated CNY FX or
claim all history is converted. Market order/pool asset prices remain BTC/XCP or
their actual quoted asset. Current fiat estimates are approximate market data,
not inputs to compose or proof of future execution value.
Dispenser history's Last and Avg fiat values are current fiat equivalents of
the historical BTC amounts, not fiat prices recorded at the time of each trade.

The primary amount, indivisible amount, fee and clipboard guidance uses concise
copy without fixed heights or clipping. Packaged Chromium checks the normal
360px wallet at English, Japanese and all three explicit Chinese locales. Longer
protocol diagnostics retain their details and are not forced into two lines.

The stacked PR's base is PR399's branch. The repository currently runs PR CI only
when targeting main/develop, so draft PR400 has no automatic checks until its
base changes; the local focused and packaged-browser evidence is reported
explicitly instead of claiming full CI coverage.
