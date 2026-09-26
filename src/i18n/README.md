# Browser-driven localization

The wallet uses Chrome's native extension catalog selection throughout onboarding,
unlocking, popup, sidepanel, and transaction approvals. There is no saved interface
language or number-format preference. `t()` reads `chrome.i18n.getMessage()`, which
resolves a key missing from the active locale from the English default catalog, so no
English is bundled into the scripts: `public/_locales/en/messages.json` is imported only
as a type, whose keys are `MessageKey`. Outside an extension runtime `t()` returns the key itself; unit tests
get English because `vitest.setup.ts` answers `getMessage` from
`public/_locales/en/messages.json` the way Chrome does.

Each catalog's `appLocale` identifies the language actually selected. It controls
the document's `lang` attribute and automatic number/date formatting, including
English fallback when the browser language is unsupported. This follows the
extension/UI locale, not merely preferred languages for websites. Browser language
changes take effect according to the browser's reload/restart behavior. There are
no live language subscriptions, manual catalog loader, or cross-window language
synchronization. Legacy `language` and `numberLocale` fields in keychains from
earlier development builds are ignored.

English, Japanese, Simplified Chinese, Taiwan Traditional Chinese and Hong Kong
Traditional Chinese catalogs are included. Chrome documents `zh_CN` and `zh_TW`
as supported Chinese locales. Packaged-browser tests also cover pinned Chromium's
behavior where a Hong Kong preference loads `zh_HK` while `getUILanguage()` reports
`zh-TW`. This is not a separate Hong Kong Chrome Web Store listing claim.
A generic `zh` catalog, identical to `zh_CN`, catches Chinese preferences with no
exact catalog (such as `zh_SG` or a bare `zh`), which Chrome would otherwise resolve
to English.
See [Chrome i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n)
and [Chromium locale selection](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/extension_l10n_util.cc).

## Prices and transaction inputs

Settings exposes only **Price currency** for display customization. It remains an
independent encrypted keychain preference, defaulting to USD regardless of browser
language. It is restored after unlocking, as before. Changing currency in another
wallet surface must preserve the current page and any unsaved transaction draft.

Transaction inputs and compose serialization never consult display formatting.
Amount drafts use ASCII digits and a period where fractions are allowed. Invalid
drafts remain visible and block submission. Generated values and Max use canonical
input formatting, not localized display strings. Exact quantities, each asset's
divisibility and the pinned SDK amount contract are unchanged.

Current estimates include an approximation mark and ISO currency code. Missing,
stale or mismatched quotes do not become estimates. BTC chart history requests the
selected currency; XCP historical charts remain explicitly USD. Current XCP fiat
estimates use the BTC/selected-fiat to BTC/USD ratio. Dispenser historical BTC
amounts may show current fiat equivalents, not fiat prices recorded at trade time.

## Messages and review

English `public/_locales/en/messages.json` is the source of truth. `MessageKey`, typed
from its keys, catches invalid keys at compile time. `node scripts/i18n.mjs check` checks
complete catalogs, used keys, named/positional placeholders and that `zh` matches `zh_CN`.
Named placeholders preserve adjacent substitutions in Chrome's catalog syntax.

Known API, hardware, verification and provider failures retain structured facts
and translate at the UI boundary. Unknown diagnostics preserve their raw text.
Translation never changes RPC codes, retry decisions, authorization or signing.

How to add, translate and review strings, and how the Chinese catalogs relate to one
another, is in [CONTRIBUTING.md](../../CONTRIBUTING.md#languages). Strings a native speaker
has checked are listed under `reviewed` in `i18n/reviewed/<locale>.json`; every other string
is a machine draft.

### Default wallet and address names

`displayAccountName` translates exact `Wallet n`, `Address n` and `UTXO Address n`
labels at presentation sites, including headers, lists, menus, notices and approval
or removal screens. Canonical names stay English in storage, domain objects and
the header cache; derivation, selection and renumbering are unchanged. No migration
is needed. The numeric suffix is preserved exactly. Other labels are returned
verbatim, including extra whitespace or text. A custom name exactly matching a
default pattern follows that pattern, consistent with existing wallet renumbering.

`e2e/tests/default-name-localization.spec.ts` checks the localized dashboard,
wallet/address lists, address details and removal confirmation against unchanged
canonical service names in every supported browser locale. The logo header reserves
space for a single-line default name; unusually long labels truncate and expose the
full display text in a tooltip.

## Validation

`e2e/tests/browser-language.spec.ts` launches separate native browser profiles for
English, Japanese, all three Chinese variants and unsupported-language fallback.
It checks onboarding, one currency control, persistence, locking, invalid-password
feedback and unlocking. It also seeds obsolete language preferences to verify they
cannot override the browser. Page locale emulation is not a substitute for this test.

The localization and approval galleries use the `browserLocale` wallet fixture,
which launches Chromium with the native locale before setup. Each language runs
in its own browser context. Galleries use authored read fixtures, not live signing
or broadcasting.

`e2e/tests/translation-quality.spec.ts` checks the fixed 350x600 popup and actual
350px/520px sidepanel layouts in Japanese and all three Chinese variants. It scrolls
the internal content container to capture long instructions and expanded approval
details, checks control overflow, and verifies that blocked payment actions stay
disabled. Popup galleries with larger browser viewports still render a 350px body;
they are not evidence of a wide sidepanel layout.

`src/i18n/test-utils.tsx` is imported only by unit tests. It mocks browser catalogs
and rerenders test roots for retained-state coverage. Optional formatter mocks
stress hypothetical comma-decimal locales; they are not application preferences
and do not ship in the extension. Amount-safety tests also exercise explicit
formatter locales directly.
