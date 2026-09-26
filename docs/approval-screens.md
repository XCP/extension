# Approval screens

The approval screens are the wallet's security surface: a request is only as safe as the user's
ability to read it before signing. "The transaction is valid" and "the screen explains it
correctly" are separate properties, and each needs its own check. This page sets out the design
language the screens follow. What the wallet verifies before any of this is rendered is in
[Signing policy](signing-policy.md).

The components live in [`src/components/domain/approval`](../src/components/domain/approval); the
pages that compose them are under [`src/pages/requests`](../src/pages/requests).

The approval pages are lazy-loaded route chunks, so opening an ordinary popup does not parse them.
The popup preloads route chunks in the background once it has rendered, approval pages first, so
an approval window rarely waits on a chunk load.

## Layout: summary card first

Every approval reads top to bottom in the same order:

1. **One exception line, when there is one.** A blocking reason or a caution the signer must weigh
   appears as a single-line notice (`ApprovalNotice`) with its evidence collapsed beneath it. It
   names the most serious item; the others sit in the collapsed list.
2. **The summary card** (`ApprovalSummaryCard`): what the transaction does, in one headline, and the
   key number: what the signer pays, receives, or puts at risk.
3. **Supporting facts**: protocol facts the headline cannot carry (an order's price and expiry, a
   dividend's cost, what an attach creates), and proof notes for a marketplace review.
4. **Transaction details**, collapsed: inputs, outputs, full addresses, raw outpoints, and the
   verification record.

A knowingly signable exception (for example, a signature that leaves outputs uncommitted) does not
paint the page red. The footer's action becomes **Review**, which opens a second screen
(`ApprovalAttentionScreen`) that names each consequence and asks for a deliberate confirmation.

Correct information hidden in a collapsed section does not count as shown. Anything the signer
needs to decide belongs in the first two layers.

## Key number above the fold

The number a signer is deciding on (what they pay, what they receive, what a listing pays out if
it sells) must be visible at the popup's 350x600 size without scrolling or expanding anything.
Headlines that end in an address put the address on its own line, in full, rather than truncating
it or letting it overflow the popup.

## Grounded UTXO vocabulary

Use the words people already use for these transactions: inputs, outputs, change, UTXO, anchor,
payment, fee, sats. Do not coin terms for the screen. When a marketplace protocol has established
names, use those. Raw outpoints and full addresses go in the collapsed details, not the headline.
Marketplace screens state every price and fee in sats, and their transaction list follows.

## Role-aware labels: who signs decides the wording

Labels come from the signer's role, derived from the proved analysis, never from a label the
website supplied. The same output is described differently depending on who is signing:

| Signer | Label |
|---|---|
| Buyer | "You pay" |
| Seller accepting an offer | "You receive" |
| Seller creating a listing | "Your payout if sold" |
| Bidder authorizing an offer | "You pay if accepted" |
| Any signer, for true leftover funding only | "Change" |

A seller's sale proceeds are never "change" or "returned to wallet". An output the signature does
not commit to is not counted as coming back, whatever address it pays today.

## Notices are for what the signer can act on

Yellow and red are reserved for something the signer can do something about, or must know before
signing. Routine protocol facts are information, not warnings. A notice should fit on one line
at popup width; if it needs more, the headline goes on the line and the explanation goes in its
collapsed details.

## Label length is enforced

Fact labels must fit on one line at popup width. `npm run lint` (through `lint:i18n`, which runs
`node scripts/i18n.mjs check`) fails when an approval fact label in any catalog is over budget:
18 half-width units for a label beside its value, 36 for a label on its own line above its value,
with full-width (CJK) characters counting as two and a `$1` substitution counted as four.
The same measure is used by [`fact-layout.ts`](../src/components/domain/approval/fact-layout.ts);
keep the two in step. A value short enough to sit beside its label is at most three words and 16
units with no closing full stop; anything longer goes under its label as prose.

## Review the galleries screen by screen

Two Playwright specs render every approval state as screenshots:

- [`e2e/tests/approval-gallery.spec.ts`](../e2e/tests/approval-gallery.spec.ts): every provider
  approval, per Counterparty message type, for raw transactions and PSBTs, with optional locales
  (`XCP_GALLERY_LOCALE`) and the side panel (`XCP_GALLERY_SURFACE=sidepanel`).
- [`e2e/tests/marketplace-gallery.spec.ts`](../e2e/tests/marketplace-gallery.spec.ts): marketplace
  intents, plain-Bitcoin payments, linked bundles, and the blocked and retry gates in front of them.

Both write to `test-results/` and accept `XCP_GALLERY_SCENARIOS` to run a subset. They also assert
layout: no horizontal overflow at 350 and 380px, fact labels on one line, the exception notice and
the signer's outcome in view before anything is expanded, and misleading text absent.

The assertions do not replace reading the screenshots. For a change that touches an approval,
review each affected screen and ask: what is happening; where the money moves; what the key number
is and whether it is above the fold; what is primary, secondary and tertiary; what is generic to
every transaction and what is specific to this one; and what the signer cannot see that they
should.
