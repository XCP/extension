# Localization consolidation (draft)

This branch preserves the catalogs and machine-review status from `localize-ja-zh`
at `bdd4a894340fee971afd51d41a7c310bb176b70a` and now incorporates current main,
including the API pacing and amount-safety changes from PR398 and PR399. New
Japanese and Chinese preference/safety messages remain listed in
`status/<locale>.json` as machine drafts. A bounded primary-source terminology
review is recorded below; native-speaker review remains outstanding.

The normal path is automatic: a new or existing keychain without an override
uses Chrome's extension language selection, including onboarding and the locked
screen. Users do not need to visit wallet settings to receive translations.
This follows Chrome's UI/extension locale, not merely its preferred languages
for websites. Settings also offers three independent choices inside the
encrypted keychain:

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

Critical amount, fee, divisibility, output verification and provider-request
diagnostics use stable codes translated at the UI boundary. Provider errors retain
their original messages and numeric RPC codes; recognized presentation codes cross
the background/UI boundary independently. Changing language re-renders an existing
error without another compose, verification or signing call. Unknown API diagnostics
retain their original text.

Counterparty action summaries use structured translated headlines, separate full
addresses and exact quantities. Unknown divisibility remains explicitly in base
units; each pool/order leg uses its own asset metadata. Safety warnings carry typed
facts from the background and translate in the foreground, including destruction,
sweep, unreadable payloads and output risks. Severity and signing decisions do not
depend on the selected language. This is bounded coverage, not a claim that every
remote diagnostic or module-initialized label supports live language switching.

Validation covers focused unit/integration tests, catalog integrity, TypeScript,
lint, production build, and packaged Chromium tests for sequential invalid typing
and cross-window preference changes. All 40 GitHub checks passed at `7734dd86`,
including ten unit shards, twenty browser batches, CodeQL and hardware tests.
See PR400 for the current revision's status; that result does not certify later
changes. Browser regressions use fixtures and do not sign or broadcast live
transactions.

`e2e/tests/browser-language.spec.ts` exercises actual browser catalog selection
without setting a wallet language: fresh onboarding, setup buttons, default
settings, locking, an incorrect password and unlocking. It starts a distinct
browser profile for each language and asserts both `chrome.i18n` and the rendered
language. Playwright's page `locale` emulation is not used as a substitute for
Chrome's native catalog selection.

The six native-browser journeys passed locally for English, Japanese, Simplified
Chinese, Taiwan Traditional, Hong Kong Traditional and German-to-English fallback.
Nineteen focused onboarding/create/import tests also passed. Setup and unlock
buttons now translate their idle labels, and the onboarding legal sentence owns
the word order around fixed Terms and Privacy links. Password drafts, private-key
drafts, selected address formats and existing authentication behavior are preserved.

Chrome documents `zh_CN` and `zh_TW` as supported Chinese locale names, but its
runtime may try a preferred extension locale before the resolved browser UI
locale. In the current packaged Chromium on Windows, a Hong Kong preference
resolves `getUILanguage()` to `zh-TW` while loading our `zh_HK` messages. The test
records that behavior for the pinned browser; it does not claim a separately
supported Hong Kong Chrome Web Store listing. The manual HK override remains
deterministic. `appLocale` comes from the selected message catalog, so document
language and default number formatting describe the text actually displayed.
References: [Chrome i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales)
and [Chromium extension locale selection](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/extension_l10n_util.cc).

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
copy without fixed heights or clipping. The packaged Chromium matrix exercises
the popup in English, Japanese and all three explicit Chinese locales at a 360px
browser viewport. The popup retains its fixed 350px content width when the browser
is resized to 1100px; those captures do not certify wider sidepanel layouts.
Longer protocol diagnostics retain their details and are not forced into two lines.

PR398 and PR399 have merged, and current main has been integrated into this
branch. PR400 targets main so the repository's complete PR checks can run.
See the PR validation record and checks for the tested revision and results.

## Bounded wording review (resumed)

`review/critical-journeys-2026-09-07.json` lists the 181 exact keys read during
an AI semantic wording review of Japanese and the three explicit Chinese
catalogs. It records hashes, changed versus retained wording, primary references
and outstanding gaps. This is not a native-speaker approval: every machine flag
remains, and previously non-machine wording was protected. That manifest is a
historical snapshot: its hashes, paused status and recorded gaps are unchanged.

After the API and launchpad releases, the user resumed a bounded extension pass.
`review/terminology-2026-09-08.md` records primary references and decisions for
address types, Japanese price-impact terms and swap routing. Address labels,
shared destination/memo headings and live preference-label updates are included.
The September 8 approval review adds structured action and safety presentations;
unknown external diagnostics remain unchanged. The optional
`XCP_LAYOUT_LOCALES` matrix is review tooling, not evidence that all localized
flows have passed. Do not treat either review note or a passing catalog checker
as approval of every localized journey.

`review/approval-localization-2026-09-08.md` and its JSON manifest record the
subsequent 181 new messages and 28 reused safety messages, exact reviewed hashes,
Counterparty Core evidence and retained machine provenance. The gallery can run
actual popup or sidepanel entrypoints with `XCP_GALLERY_SURFACE`; widening a popup
is not a substitute for the sidepanel test. Consult that record and PR400 for
the completed scenarios and validation limits.
