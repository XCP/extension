# Browser-driven localization

The wallet uses Chrome's native extension catalog selection throughout onboarding,
unlocking, popup, sidepanel, and transaction approvals. There is no saved interface
language or number-format preference. `t()` reads `chrome.i18n.getMessage()` and
falls back to the generated English catalog outside an extension runtime.

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

English `public/_locales/en/messages.json` is the source of truth. Generated
`MessageKey` types catch invalid keys. `node scripts/i18n.mjs check` checks complete
catalogs, used keys, named/positional placeholders and generated English contents.
Named placeholders preserve adjacent substitutions in Chrome's catalog syntax.

Known API, hardware, verification and provider failures retain structured facts
and translate at the UI boundary. Unknown diagnostics preserve their raw text.
Translation never changes RPC codes, retry decisions, authorization or signing.
Historical order/MPMA displays retain the contextual corrections in PR405.

The records under `review/` describe earlier terminology and contextual passes;
their exact hashes and machine provenance remain historical evidence, not current
native-speaker signoff. This simplification removes obsolete preference messages
without revising the remaining translations. Native-speaker review is outstanding.

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

`src/i18n/test-utils.tsx` is imported only by unit tests. It mocks browser catalogs
and rerenders test roots for retained-state coverage. Optional formatter mocks
stress hypothetical comma-decimal locales; they are not application preferences
and do not ship in the extension. Amount-safety tests also exercise explicit
formatter locales directly.
