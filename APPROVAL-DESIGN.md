# Approval design audit and implementation

**Status: implemented with the provider review refactor. See [APPROVAL-REVIEW.md](APPROVAL-REVIEW.md) for the complete comparison and validation record.**

**User direction:** preserve the existing wallet header and requesting-site card, including the recognizable favicon/globe, hostname, and origin treatment. Refine the decision content below it. The initial compact replacement for the site header was not accepted.

The objective is a familiar, compact approval flow that makes the proposed action understandable and reserves interruption for a specific consequence. The user must remain attentive to what they authorize. Routine reassurance, repeated verification badges, and decorative warning colors can teach users to ignore the very signals that should matter.

The original audit below reviewed 25 ordinary raw-transaction gallery images, selected PSBT equivalents, 18 marketplace images, and the approval components and request pages. Its findings and proposed contract explain the subsequent implementation. Source links point to the current files; [APPROVAL-REVIEW.md](APPROVAL-REVIEW.md) records the final comparison against main.

## What the gallery shows

| Group | Examples | Assessment and direction |
| --- | --- | --- |
| Strongest | `send-divisible-bech32`, `checkout-buy-proved`, `listing-attach-caution` | Clear action or amount, understandable supporting facts, and a recognizable progression toward approval. Use these as references for information hierarchy, while retaining each action's actual conditions. |
| Strongest composition | Order give/receive cards | Two related amounts read as a trade instead of an opaque sentence. Preserve this composition. The slippage callout is a separate issue and does not make the give/receive structure wrong. |
| Middle | MPMA, dispenser, issuance, paired prepare | Useful information is present, but grouping, field treatment, and density need a common grammar. MPMA must keep every recipient and quantity available. Paired prepare must keep the signing identities clear. |
| Middle | CPFP | Lead with the user's net proceeds and place the fee explanation beneath them. Do not imply that gross returned value is the amount the user gains. |
| Weakest | Listing, reprice, offer, bundle-attach | Long prose is forced into narrow value columns. Broken words such as “UT XO” and “fundi ng” obscure the meaning. Separate explanatory sentences from identifiers and short facts. |
| Weakest | `bitcoin-pay-proved` | A routine blue verification card competes with the actual payment. Present the proved payment facts neutrally; retain precise mismatch evidence when verification fails. |
| Weakest | Pool deposit | A long hero sentence overwhelms the card. Give the action a short heading and show the quantities and assets as structured facts. |
| Weakest state handling | `listing-create-retry` | The explanation says to retry while the primary control says “Blocked.” The displayed state and available recovery action should agree. Signing must stay unavailable until verification succeeds. |
| Needs factual review | Fairminter | The visible summary communicates too little of the agreement. Check coverage of applicable price, lot size, caps, deadlines, and other decoded terms before polishing the card. This is not just a cosmetic problem. |
| Needs precise consequence | Destroy attention screen | The restrained visual treatment is useful, but the second step becomes generic and does not repeat the concrete “1 BONPARTY” consequence. Keep the exact amount and asset visible at the final decision. |

**Capture caveat:** the gallery deliberately uses a 380 × 1400 viewport to expose content inside the popup's scrolling area. The resulting empty tails are not evidence of product blank space. Clicking a disclosure can also scroll its focused control into view; a screenshot taken afterward may appear to omit the top of the page. Judge first-view composition at actual popup sizes, and treat expanded captures as detail evidence. See the [raw gallery capture setup](e2e/tests/approval-gallery.spec.ts) and [marketplace capture setup](e2e/tests/marketplace-gallery.spec.ts).

## Structural causes

1. **Shared pieces do not yet provide a shared page layout.** [Approval chrome](src/components/domain/approval/approval-chrome.tsx) supplies the wallet identity, site bar, and footer, but pages separately own background, padding, scrolling, and order. [Connect](src/pages/requests/connect/approve.tsx) has a larger centered site card and extra header spacing; [message approval](src/pages/requests/message/approve.tsx) duplicates the header and footer. PSBT places paired-signing details before the requesting site.
2. **Raw transaction and PSBT summaries can drift.** [Raw transaction approval](src/pages/requests/transaction/approve.tsx) hand-renders the same action, address, money movement, and protocol fee handled by [ApprovalSummaryCard](src/components/domain/approval/approval-summary-card.tsx). One shared renderer should own this presentation.
3. **Content length selects the wrong visual semantics.** [CounterpartyDetailsCard](src/components/domain/approval/counterparty-details-card.tsx) treats values longer than 32 characters as small monospace identifiers. Long explanatory prose is therefore styled like a hash. [MarketplaceReviewCard](src/components/domain/approval/marketplace-review-card.tsx) gives every value a right-aligned, 65%-width column with `break-all`, which can split ordinary words. The current [ProtocolField](src/core/counterparty/describe.ts) is the natural place to consider explicit field semantics when implementation begins.
4. **Normal facts and exceptional conditions use competing conventions.** [Verified Bitcoin payments](src/components/domain/approval/bitcoin-payment-card.tsx) get a blue callout; [ordinary connection disclosure](src/pages/requests/connect/approve.tsx) gets a yellow one. In contrast, [successful VerificationStatus](src/components/domain/tx/verification-status.tsx) renders nothing, and proved marketplace facts are neutral. [The attention screen](src/components/domain/approval/approval-attention.tsx) already demonstrates a more restrained approach.
5. **Spacing and type roles are documented but not consistently applied.** Summary cards use 20px insets, other cards use 16px, and [card disclosures](src/components/ui/collapsible.tsx) use 24px horizontal insets. [ErrorAlert](src/components/ui/error-alert.tsx) adds its own margin and inherits a different text size. The [documented type scale](src/entrypoints/popup/style.css:25) has not become a consistent component contract.
6. **The second step declares modal behavior without providing it.** [ApprovalAttentionScreen](src/components/domain/approval/approval-attention.tsx) uses a fixed `div` with `aria-modal`, but does not manage initial focus, contain keyboard focus, make the background inert, or restore focus. A proper dialog primitive should own those behaviors.

## Proposed layout and type contract

Use one approval shell with this reading order: **existing wallet header and requesting-site card → action and consequence → supporting facts → technical details → pinned action footer**. Reuse the existing identity/site components and their familiar appearance. A blocked or retry explanation belongs before technical details. Optional signing-address information should remain available within the identity/facts area without moving the site to a different position in the flow.

Keep the existing restrained neutral background and compact card approach. Standardize outer gutters and card insets at **16px**, section gaps at **12px**, and use one radius/border treatment. Avoid nested cards when a label, value, and divider express the same relationship. Keep the footer's actions easy to reach; reduce decorative padding rather than shrinking action targets.

| Role | Font size / line height | Treatment |
| --- | --- | --- |
| Action heading | 18px / 24px | Semibold, concise, sentence case. Describes the action rather than the verification machinery. |
| Principal amount | 24px / 30px | Semibold or bold, with tabular numerals where comparison helps. Reserved for a quantity or tightly related give/receive amounts, not a paragraph. |
| Body and primary facts | 14px / 20px | Regular body; medium emphasis for important values. Natural word wrapping. |
| Identifiers and metadata | 12px / 18px | Monospace for addresses, hashes, and outpoints; regular face for ordinary metadata. Readable contrast even when visually secondary. |

Field presentation must follow meaning, not string length. A small discriminated set such as `amount`, `address`, `outpoint`, `text`, and `paragraph` would let the renderer choose an appropriate layout. Amounts can form compact comparison rows; addresses and outpoints can occupy full-width lines; paragraphs should read left-to-right at body size. Token-aware wrapping is appropriate for identifiers. Ordinary prose must not use arbitrary character breaks. Asset names should remain distinguishable from their quantities without becoming long hero text.

Full destinations remain inspectable and copyable. Do not trade away the existing [full output addresses](src/components/domain/approval/approval-transaction-details.tsx) to make a screenshot look cleaner. Abbreviated supporting summaries must never become the only evidence of who receives funds. Preserve exact message whitespace and the distinction between a rendered message and the bytes being signed.

### Listing amounts and delivery

The initial mockup inherited the standalone gallery's 546-sat asset input. The newer attach-and-list fixture uses 330 sats; neither value should be treated as a universal constant. The wallet verifies the actual prevout value and requires the guaranteed seller payout to equal **sale price + asset-input sats** ([listing analyzer](src/core/counterparty/marketplaceIntent.ts)). For a 250,000-sat price and a 330-sat asset input, the seller's payout is 250,330 sats: 250,000 from the sale plus 330 of their existing sats returned.

A listing permits the buyer to choose attached or detached delivery. In either case, the seller payout includes the original asset input’s verified value. Attached delivery creates a separate buyer-owned carrier, funded by the buyer; it does not reduce the seller payout. Present **Sale price**, **Your UTXO sats returned**, and **Your payout if sold** separately. “If sold” matters: signing a listing does not execute the sale or broadcast it. Regression cases cover both delivery modes with 330- and 546-sat seller inputs, including rejection when the buyer carrier is subtracted from the seller payout. Offer proceeds have their own fee accounting and must not inherit this listing-specific label.

## Attention and state contract

| State | Presentation | Action behavior |
| --- | --- | --- |
| Routine, proved action | Neutral action, amounts, identities, and facts. No congratulatory verification badge or routine warning-colored box. | Preserve the existing direct approval behavior. |
| Signable exception | Name the concrete consequence once. Preserve the existing explicit review step and repeat the affected amount, asset, or authorization boundary at confirmation. | Preserve acknowledgement requirements and use the existing action-specific confirmation label. |
| Blocked | One prominent explanation of the failed condition, with the exact mismatch or relevant evidence available. | Signing remains unavailable. Do not provide an acknowledgement that bypasses a blocker. |
| Verification incomplete / retry | Explain what could not be verified and how the user can recover. Do not imply that unavailable evidence proves the request safe. | A real retry/re-request action may be offered when supported; otherwise give an accurate next step. Never relabel a signing button as retry without implementing retry behavior. |
| Execution error | A concise error associated with the attempted action, without duplicating the same condition in several cards. | Preserve existing cancellation, busy, hardware, and error behavior. |

The current [transaction policy and attention predicates](src/pages/requests/transaction/approve.tsx) and [PSBT predicates](src/pages/requests/psbt/approve.tsx) are constraints, not styling decisions. Preserve background verification, allowed signing inputs, paired-address consent, identity binding, acknowledgement, and every existing block/retry condition. [Message-signing risks](src/pages/requests/message/approve.tsx) must remain disclosed. A quieter screen must never hide a consequence needed to make the decision.

For destroy, the attention title or leading statement should repeat the decoded quantity and asset—for the reviewed example, “Destroy 1 BONPARTY”—and its irreversible consequence. For persistent offers/listings, retain the authorization scope, who may complete it, and the actual cancellation or expiry rules. For fairminters, verify the [decoded terms being described](src/core/counterparty/describe.ts) before deciding which terms form the main summary.

Keep recovery separate from authorization: place retry in the unavailable-verification explanation and keep the approval footer unavailable until a fresh review succeeds. A repeated click on retry should not land on an approval button that has just replaced it. The interactive proposal illustrates the successful recovery state; production retry must still perform fresh background verification.

## Accessibility constraints

Color should reinforce explicit words or symbols rather than carrying status alone. Normal text requires 4.5:1 contrast; large text requires 3:1. In particular, audit faint full origins and metadata, including the [site bar's gray-400 origin](src/components/domain/approval/approval-chrome.tsx). These are acceptance targets, not a claim that contrast has already been measured for every current combination. [WAI color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Use live alerts for important dynamic feedback, not every routine fact. Frequent interruptions impair usability, and alerts should not steal keyboard focus. Deliberate attention steps need dialog behavior instead: appropriate initial focus, a contained tab order, an inert background, Escape/back handling consistent with the workflow, and focus restoration. [WAI alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/), [modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

The compact default layout must remain usable at 200% text enlargement and with user text-spacing overrides. WCAG does not prescribe the proposed default spacing; it requires that user overrides do not lose content or functionality. [Resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).

## Staged implementation proposal

1. **Agree on the concrete reference screens and factual coverage.** Compare a normal send, marketplace checkout, long listing/offer, retry, destroy attention, and fairminter against this contract. Confirm what each approval authorizes before changing its presentation.
2. **Consolidate the shell and typography.** Introduce the shared layout/card treatment, reuse chrome in connect/message, and remove duplicated raw-transaction summary markup. Keep page-specific policy calculations and callbacks intact. Implement proper attention-dialog behavior.
3. **Introduce semantic fact rendering.** Add explicit field kinds at the display-data boundary and migrate long marketplace prose, identifiers, pool-deposit quantities, and CPFP proceeds. Preserve decoded values and their evidence; do not infer field meaning from localized labels or character count.
4. **Align exception and recovery presentation.** Remove routine blue/yellow emphasis, consolidate duplicate reasons, keep exact consequences at the final decision, and align retry wording with a real recovery action. Review fairminter content gaps as factual issues with appropriate semantic checks.
5. **Verify the representative matrix before broader adoption.** Review actual-size screenshots, keyboard behavior, text scaling, and semantic assertions together. Keep gallery improvements separate from production behavior so capture artifacts do not drive product changes.

## Acceptance criteria

- At **350 × 600** and **380 × 600**, the initial view gives a recognizable action, requesting site, signing identity, and principal consequence. Scrollable content and the pinned footer work together without overlap or an inaccessible final row.
- Long addresses, outpoints, asset names, titles, and explanatory sentences do not cause horizontal overflow, clipping, or broken ordinary words. Expanded and collapsed details both remain usable. Every destination needed for review is available in full.
- Body text, quantities, identities, and alerts follow their declared type roles. Card boundaries, 16px insets, and 12px gaps align across connect, message, raw transaction, PSBT, and bundles.
- The same action has equivalent amounts, recipients, fees, and policy meaning in raw-transaction and PSBT views. Semantic assertions verify factual content and signing availability; screenshots alone are insufficient.
- Existing blocked cases stay blocked; retry stays unverified until a successful fresh check; attention still requires the existing acknowledgement. Message risks, paired-address consent, hardware confirmation, and request lifecycle behavior remain intact.
- The final destroy decision repeats the exact quantity and asset. Persistent authorization screens retain scope and cancellation/expiry consequences. Fairminter cases assert applicable factual coverage instead of merely asserting that a heading renders.
- Keyboard focus enters the attention dialog, stays within it, and returns correctly. Underlying controls cannot be operated while it is modal. Disclosure and footer controls have visible focus states and accurate accessible names.
- At **200% text size** and the WCAG text-spacing overrides, no content or action becomes clipped, overlapped, or unavailable. Contrast is checked against actual rendered colors, including secondary metadata.
- A **five-second comprehension check** with someone unfamiliar with the screen asks: “Which site is asking, what will happen, and what deserves attention?” It should reveal the action and principal consequence without relying on verification reassurance. Detailed inspection can take longer; speed is not a substitute for informed consent.
- Review top-of-page and expanded-state captures separately. Do not count the deliberate 1400px gallery tail or focus-induced scrolling as product whitespace or missing content.

## Implementation and verification

- `ApprovalLayout` now owns the shared reading order, 16px gutters, 12px section gaps, scrolling content, and pinned footer across message, transaction, PSBT and bundles. Following user review, connection retains its existing centered site card, permissions layout, and equal-width footer. Existing wallet/site identity styling is retained; full origin contrast is improved. Footer actions name the operation, reserve retry for a separate control, and wrap at enlarged text sizes.
- Connection disclosures are bound to the current request, wallet, and address; stale paired-address responses are discarded. The requesting site comes from the matched background request.
- Raw transactions and PSBTs share `ApprovalSummaryCard`. `ProtocolField` declares visual meaning explicitly; `ApprovalFacts` handles prose, quantities, full addresses/outpoints, and primary amounts. Addresses retain their exact text and gain balanced wrap points.
- Listings distinguish sale price, actual attached-input sats returned, and payout **if sold**. Both 330- and 546-sat inputs remain supported and tested. Bundle monetary consequences precede supporting identifiers; CPFP leads with final proceeds. Checkout and pool headings no longer put long monetary sentences in the hero.
- Ordinary Bitcoin payments use neutral payment facts. Failed comparisons preserve both destinations when different, consolidate a shared destination when identical, and show the exact amount difference. Unresolved outputs retain their amount and script evidence. Network fees with unresolved inputs are unavailable; XCP protocol fees retain exact decimal/bigint values.
- Retry reruns background authorization, decoding, and policy against the original request. It never retries a signing command. Successful evidence retains existing cache TTLs; failed lookups are attempted again. Stale reviews cannot authorize during or after a failed refresh. Initial read failures also offer recovery without being described as expired requests.
- Attention uses a real dialog with managed focus, inert background, Escape/back behavior, and focus restoration. A tested initialization workaround handles Headless UI's repeated-mount inertness behavior. Final destroy confirmation repeats the decoded quantity and asset.
- Fairminter approvals now carry actual decoded price, lot, caps, deadline, commission, reserve, and payment-routing terms. Local wire divisibility takes precedence over metadata. Decoder tests also cover the optional MIME/description fields.

The gallery now records initial 350 × 600 and 380 × 600 views separately from expanded evidence. The full **65 transaction/PSBT and marketplace scenarios** pass, including retry recovery and representative 200% text enlargement and text-spacing overrides. A real browser connection → multiline message signing → result recovery flow verifies exact message whitespace; connect/message also have initial and enlarged-text captures. Focused presentation, protocol, provider, storage/session, RPC, and hardware-conversion regression suites pass, as do TypeScript, the existing lint budget, and Chrome and Firefox production builds. Updated memo, action-label, and checkout cases were recaptured after the final visual review. The full suite runs in CI; physical hardware was not tested locally.

Remaining acceptance work: a five-second comprehension check with unfamiliar users and a broader accessibility audit remain human/product validation tasks. The representative enlargement checks establish usable scrolling and footer access; they do not certify every extension screen.
