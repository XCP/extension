# Translation wording, layout and flow review — 2026-09-20

The reviewed flows are usable after the corrections in this revision. The initial
catalog was complete by key count, but that hid translation and presentation
defects: untranslated payment comparisons, incorrect Traditional Chinese
characters, fragmented gift-card instructions, and truncated Japanese headings.
These were corrected rather than treating catalog coverage as a quality verdict.

This is an AI contextual and visual review of PR #405, based on
`b855114fe6ba0b38cbbaeb3e0e66b96f4d14715f`. It is not native-speaker certification
or an exhaustive visual review of every message. See the [change record](quality-layout-2026-09-20.json)
for before/after text and final catalog hashes. Existing machine provenance is
preserved; this pass does not mark the catalogs as human-reviewed.

## Findings and corrections

| Finding | Result |
| --- | --- |
| Payment mismatch sentences substituted literal English `more` / `less` into Japanese and Chinese. | Separate complete messages translate direction and word order while preserving exact quantities and `sat` / `sats` units. |
| Expanded payment details exposed English verification reasons beneath a translated headline. | Four known proof diagnostics translate at the display boundary. Raw evidence, output indices, verification and blocking logic remain unchanged. Unknown diagnostics remain verbatim. |
| Gift-card details assembled three sentence fragments around an address and derivation path. | One complete message supports locale-specific order, with styled address/path substitutions. The warning explains shared control and moving retained assets to one's own address. |
| The Japanese import screen mixed mnemonic terminology and clipped the page title. | The form uses the established recovery-phrase term. The header permits two lines and grows; its full title is also available as a tooltip. |
| Japanese expiry labels collided with their values. | Expiry and fee rows wrap with spacing at narrow widths. |
| Traditional Chinese contained mechanical conversion errors: `求籤名`, `被髮往`, and `併合並裸多籤`. | Corrected to signing, sending and bare-multisig terminology. Taiwan-specific `隻能`, account, custom-setting and help-text wording were corrected. |
| Transaction action summaries used a different word for dispenser than navigation and forms. | Reused each locale's established dispenser noun in action summaries. Open-dispenser wording now describes operating status. |
| Chinese deposit/withdraw buttons could imply that clicking immediately confirmed the operation. | Buttons explicitly lead to details/review; swap uses the same pattern. |
| A sale time window was called a UI window; an attached-asset description added “next” UTXO. | Corrected the time-period meaning and removed the unsupported “next” claim. |
| Hong Kong's nested-SegWit label and popup loading accessibility label were English. | Localized the labels while retaining the technical name. |

## Wording and flow assessment

- **Onboarding and recovery:** the recovery-phrase vocabulary is consistent on the
  reviewed Japanese import screen. Gift-card detection, why a card is imported
  differently, and the shared-secret warning now read in a logical sequence.
  The warning remains necessarily long and uses the normal content scroll area.
- **Send, trade and liquidity forms:** labels, quantities, validation and next-step
  actions read coherently in the sampled screens. Chinese review buttons describe
  the next screen. Canonical inputs and amount serialization are unchanged.
- **Approval and failure states:** amount direction, recipient, network fee,
  mismatch explanation and blocked action can be understood together. Expanded
  details retain complete addresses. Destructive-operation notices remain visible
  in the sampled destroy approvals; raw-transaction and PSBT forms were checked.
- **Settings and history:** native language selection leaves one price-currency
  control. Japanese settings wrap without squeezing values; order/MPMA history
  samples retain localized labels and exact asset quantities.
- **Locale tone:** Japanese uses explanatory polite prose; Taiwan and Hong Kong
  retain their regional import/storage and dispenser vocabulary. Technical terms
  such as PSBT, UTXO, SegWit, assets and units remain recognizable. Further regional
  editorial polish is still appropriate before claiming native-quality copy.

## Coverage and evidence

All six catalogs contain **1,956 messages**. Catalog validation reports no missing
keys, stale keys or placeholder mismatches. This is structural coverage, not a
claim that all messages received individual native-language approval.

Source review covered onboarding, recovery, common/settings terminology,
transaction forms and histories, connection/signing approvals, marketplace,
issuance/destruction, provider failures and hardware guidance. Catalog-wide scans
also checked English leftovers, suspicious Traditional Chinese conversions and
untranslated JSX labels. Brands, technical identifiers and unknown external
diagnostics are not automatically translation defects.

Rendered evidence comes from packaged Chromium with native browser locales `ja`,
`zh-CN`, `zh-TW` and `zh-HK`, using authored read fixtures and a public test phrase.
Representative screenshots were visually inspected for wording in context,
line breaks, hierarchy, warnings, buttons, addresses, amounts and scrolling.
Automated screenshots are broader than the manually inspected sample.

The new `translation-quality.spec.ts` covers eight scenes per surface: empty
import, detected gift card, settings, order settings, overpayment, expanded
overpayment, underpayment and expanded underpayment. Each language runs against
the **350x600 popup**, **350x760 sidepanel** and **520x760 sidepanel** entrypoints
at controlled viewport sizes. It scrolls
the actual internal container and checks overflow, unresolved placeholders,
readable import titles, full payment addresses and visible disabled approval
actions. Native browser, canonical-input and historical layout tests provide
additional coverage. Send-with-memo, order and destroy approval galleries add
raw-transaction/PSBT samples for all four languages.

An earlier gallery varied the browser viewport to 360/1100px while loading
`popup.html`, whose body remains fixed at 350px. Those images are useful popup
evidence but do not validate wider layouts. This pass adds real sidepanel checks.
Likewise, `fullPage` alone does not reveal content inside a nested scroll area;
the new gallery captures successive scroll positions.

## Validation

The final quality run passes all four languages: **96 scenes / 109 scroll
captures**. **150 focused unit tests**, TypeScript, lint, catalog checks and the
Chrome production build pass. Six native-browser journeys, four historical
galleries, four canonical-input journeys and four approval galleries also pass.
One earlier Hong Kong run lost its browser during navigation; the complete fresh
quality run passed without retries. This interruption is retained in the record.

Validation results and exact local artifact directories are recorded in the JSON
companion. The reproducible checks are:

```text
npm run compile
npm run lint
npm run build
npx playwright test e2e/tests/browser-language.spec.ts e2e/tests/localization-depth.spec.ts e2e/tests/localized-journeys.spec.ts e2e/tests/translation-quality.spec.ts
```

Focused unit coverage includes catalog helpers, payment comparisons/reasons,
gift-card substitution order, order settings, headers/layout, action terminology,
onboarding and Bitcoin payment verification. The existing PR workflow discovers
the new browser test automatically.

## Remaining limits

Native-speaker editorial signoff remains outstanding. This pass does not certify
every rare error, marketplace state, device prompt or platform font rendering.
Hardware guidance was read in source; physical hardware flows were not exercised.
Unknown upstream/device diagnostics may still be English. The gallery performs no
signing or broadcast. Hong Kong behavior reflects the pinned Chromium locale
resolution described in the i18n README, not a new Chrome Web Store locale claim.
