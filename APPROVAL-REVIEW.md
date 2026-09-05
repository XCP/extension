# Approval comparison review

The review compares 67 matching initial screens against `main` at `91dd23f3`: 25 raw transactions, 25 PSBTs, 15 marketplace states, connection, and message signing. The updated gallery also captures successful retry recovery, which has no baseline counterpart. Each screen has 350 × 600 and 380 × 600 captures; expanded details, attention, paired signers, and representative text-enlargement variants are separate views.

Baseline production code stayed at tree `b00360c68cabee141546cd5115a49b34a52775cb`. Its test harness gained matching capture dimensions and the same browser-security fixture correction as this PR. Wallet addresses differ between runs. Fixtures exercise production parsing, review, and UI with mocked network evidence; captures are not evidence of a live marketplace purchase or hardware test.

## What improved

| Screens | Review result |
| --- | --- |
| Bitcoin payment | Recipient, exact amount, fee, and total wallet debit replace routine blue reassurance. A failed comparison leads with the actual mismatch and retains output evidence. |
| Listing and reprice | Sale price, actual UTXO sats returned, and payout **if sold** are separate. The original site card remains familiar. “Not broadcast now.” states the timing directly. |
| Attached listing bundle | Monetary consequences precede long supporting identities. Conditional payout leads; immediate attach costs are separate, the CTA fits on one line, and paired signers and exact fee terms remain expandable. |
| Offer with fee bump | Final proceeds lead; total network fees are grouped in the initial view, with parent/child fees and package rate retained in expandable detail. |
| Checkout | Item count is a short heading; the verified amount paid precedes supporting payment rows so it stays in the first view. |
| Ordinary transaction and PSBT | Shared shell, relative line heights, semantic facts, balanced full identifiers, and action-specific footer labels remove inconsistent spacing and arbitrary word breaks. |
| Fairminter and issuance | Actual decoded terms and issuance descriptions are retained instead of being lost in presentation adapters. More terms are deliberate factual coverage. |
| Memo send | The decoded memo reaches both approval paths. Visible UTF-8 preserves its content; binary/control bytes are explicitly represented as hex. |
| Dividend, fairmint, dispenser | Dividend rates explicitly say “per unit,” separate from the total dividend. Approval headings name minting, fairminter creation, and dispenser funding or closing. |
| Connection and message | The existing centered connection screen is restored; message signing keeps the improved layout. Paired addresses remain scoped to the request identity. Exact multiline message bytes are tested through signature verification. |
| Retry and attention | Recovery has its own control, and signing remains unavailable until review succeeds. Concrete caution/blocker reasons appear directly below the site in the first view, with full evidence expandable. Attention retains focus containment, inert background, Escape/back behavior, and focus restoration. |

The PSBT detach fixture changes from **Sign** to **Review** for a substantive reason: its funding input now belongs to the declared signer, and the effective signing plan identifies the attached assets leaving for another address. The original fixture did not identify that signed source. The same asset balances remain visible; the added attention step is intentional.

## Remaining review considerations

Long approvals still require scrolling. Pool deposit prioritizes its exact deposits ahead of pool identifiers and fee terms. Fairminter caps, timing, locks, and payment conditions cannot all fit in one popup view. Multi-send retains every recipient but has no aggregate asset summary. Full destinations remain inspectable in transaction details when a supporting payment row abbreviates them.

These are visible tradeoffs to revisit with users, not a claim that every screen has reached its final design. A comprehension check with someone unfamiliar with the wallet and a broader accessibility audit remain product validation work.

## Viewing and regenerating comparisons

The two gallery specs write initial captures alongside expanded evidence. `provider-message-signing.spec.ts` captures connection and exact multiline message review. CI retains their files in the E2E result artifacts.

Given two saved capture directories, generate a portable comparison with no external dependencies:

```sh
node scripts/build-approval-comparison.mjs before/test-results after/test-results comparison.html "Baseline commit" "Updated commit"
```

The viewer provides group/screen selection, previous/next navigation, both popup widths, expanded/attention/signer views, and available accessibility variants. Missing counterparts are explicitly labeled, including the new successful retry state. Initial captures are compared separately from the deliberate 1400px expanded-gallery tail.

Run specific gallery specs after a Chrome build. Preserve captures when rerunning a subset by setting a different Playwright `--output` directory; Playwright otherwise clears `test-results` at startup. `XCP_GALLERY_SCENARIOS` selects named cases while retaining their assertions and both raw/PSBT variants.

## Provider integration

The popup now reads a background-produced review and sends its bound decision. The background owns request bytes, signing inputs, policy, execution, and the durable result. Identity and permission checks protect both signing and result delivery; completed signatures are retained when delivery is refused, so authorized recovery does not sign again. See [ARCHITECTURE.md](ARCHITECTURE.md).

Validation includes focused presentation, protocol, provider, storage/session, RPC, and hardware-conversion regression suites; TypeScript and lint; Chrome and Firefox production builds; the complete galleries; and real browser connection/message signing with result recovery. Physical hardware and user comprehension are outside the automated check.

The follow-up review also compresses payment mismatches to their exact difference, with full amounts, destinations, scripts, and site metadata under a comparison disclosure. Gallery assertions require caution/block reasons in the first view and a single-line attach-and-list action at default text size.
