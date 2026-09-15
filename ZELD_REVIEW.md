# ZELD PR review

Reviewed [PR #412](https://github.com/XCP/extension/pull/412), starting at head **79c4c0af**.

## Intended behavior

Mining defaults to **off** (the PR defaulted to 30 seconds). Turn on **Enable ZELD Hunting**, choose a maximum wait, and make ordinary eligible transactions. The switch starts with a 15-second budget; the cap remains 60 seconds. Existing saved budgets are preserved. Hunting preserves selected inputs, output scripts and amounts, and **the exact BTC fee**. It adds no output or mining transaction. A timeout falls back to ordinary signing; cancellation or a changed wallet session withholds the signature.

Input sequences are final. Single-input legacy and unsigned SegWit hunts vary nLockTime; multi-input legacy hunts in Chrome can combine valid signatures over a fixed transaction. Existing eligibility restrictions remain: rewards must land on the wallet's first spendable output, and legacy hunting requires a software wallet. Finding a candidate and the eventual reward amount are not guaranteed.

## Findings fixed

| Priority | Finding | Change |
| --- | --- | --- |
| P1 | Legacy hunting exported the private key to the popup composer and bypassed the normal signer/session guard. Aborting could fall through to ordinary signing. | Hunt inside the background transaction signer after input/output validation, using resolved parent scripts. Check session identity during hunting and before releasing signatures. Cancellation throws; the composer checks cancellation before broadcast. |
| P1 | Hunting an inscription commit changes the txid used by its already-signed reveal. | Skip hunting when a signed reveal is attached. |
| P2 | The SegWit path trusted the custom hasher's txid and rarity. | Independently double-hash winning bytes with Noble, including nested SegWit's scriptSig; validate nonce, txid and rarity. Independently verify every legacy signature. |
| P2 | Worker startup failures and repeated errors could leak workers or end a hunt prematurely. | Account for completion once, terminate workers on every exit, and include startup in the budget. |
| P2 | Late balance responses could overwrite a newer address; failures appeared as zero balance or empty history. | Extract address-bound fetching, discard obsolete responses, show unavailable states and offer retry. |

## No additional permissions

The manifest configuration is unchanged from the PR. Chrome legacy hunting runs in the existing background service worker; signing secrets remain there. It creates no offscreen document and requests no new permission. Firefox background pages retain their existing Worker support.

## Legacy optimizations

Retain the PR's fixed-ECDSA-nonce technique: prepare independent signing constants per input, vary locktime, and publish only the winning transaction. Three incremental changes reduce work:

1. Process SHA-256 in eight-round groups, avoiding state-variable copies after every round.
2. Cache the transaction-hash block before the **first signature's s value**. Version, outpoint and r are constant; all mutable signature bytes remain outside the cache. Retain sighash prefix caching.
3. Reuse DataViews for 256-bit digest/scalar conversion instead of allocating them per input per attempt.

Choose a low-R nonce during preparation, matching ordinary wallet signing and avoiding a DER padding byte per input. Differential tests cover cached versus uncached hashes, compressed/uncompressed keys, one/three inputs, high locktimes and nonce-space boundaries.

### Chrome 153, one hashing thread

Counterparty-composed broadcast shape, identical template and nonce ranges across candidates; five rotating-order rounds of 100,000 candidate nonces. Rates count actual attempts, excluding short-S candidates.

| Inputs | PR | SHA improvement | Plus txid prefix | Plus reused views | Total gain |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 248,475/s | 279,002/s | 317,064/s | **346,633/s** | **39.5%** |
| 3 | 92,269/s | 103,946/s | 109,151/s | **114,594/s** | **24.2%** |

Node 24 also improved: 205,052 → 273,638 attempts/s for one input; 75,296 → 91,222 for three inputs. These isolate the changes using an unfunded deterministic benchmark key. Separate wallet proofs below validate actual spends.

### Signature combinations for multi-input legacy transactions

[Bitcoin Core's legacy SIGHASH_ALL serializer](https://github.com/bitcoin/bitcoin/blob/v30.0/src/script/interpreter.cpp#L1192-L1209) excludes scriptSigs. Each input therefore has a fixed signing message even when another input's signature changes. Prepare 2,048 valid signatures for the last input, generate a new signature for the penultimate input per pass, and hash their combinations. Earlier inputs and locktime stay fixed. The cached SHA prefix extends to the last input's signature. The hot loop performs no signing or modular multiplication.

Noble generates randomized low-S signatures. Reject short/high-R integers to retain the ordinary wallet's signature size. Independently verify every winning signature and bind the actual DER headers, sighash flags and public keys to the approved template. Key bytes and the signing closure remain in the background; the closure is never posted to a worker.

Preparation is included in the deadline and yields in 16ms slices, including during signature generation. Use this technique for at least two inputs, a budget of at least five seconds, and a runtime without Workers (Chrome MV3). Shorter budgets, single-input spends and Firefox's existing parallel runtime keep the fixed-k path. Never add a BTC input just to enable this optimization.

Production coordinators in a Chrome 153 service worker, 20-second runs, including preparation and timer yields:

| Inputs | Fixed-k locktime | Signature combinations | Improvement |
| --- | ---: | ---: | ---: |
| 1 | 255,780/s | Not applicable | Unchanged |
| 2 | 147,645/s | **316,871/s** | **2.15x** |
| 3 | 83,346/s | **307,224/s** | **3.69x** |

At these measured rates, the modeled six-zero probability in 20 seconds is about 26% for one input and 31% for two/three inputs. In 30 seconds it is approximately 37% and 42–43%. These are random outcomes, not deadlines for a guaranteed find. Rates vary by device, transaction size and load. Reproduce with **scripts/bench-zeld-pool-production.mjs**.

The prototype compared pools of 128, 512, 2,048 and 8,192 signatures. Small pools lost throughput to repeated yields; 8,192 increased startup cost without a useful steady-state gain. The retained 2,048-signature pool uses short time slices across passes. Historical worker-pool and prototype measurements remain in the evidence JSON; they do not describe current Chrome production throughput.

### Other candidates tested

On actual native/nested/Taproot broadcast bytes, eight-round SHA unrolling improved hashing by about 20–23%. Fully unrolling all 64 rounds added only another 4–6% while greatly expanding the crypto implementation, so it was not adopted. Reusing Noble SHA state with a cached prefix was slower (about 0.78–0.82M/s versus 1.27–1.34M/s). That experiment also depends on an internal Noble clone method and stays outside production.

Reproduce with **scripts/bench-zeld.mjs** and **scripts/bench-zeld-legacy.mjs** after recording regtest fixtures. Detailed samples: **test-results/zeld-optimization-bench.json** and **test-results/zeld-legacy-optimization-bench.json**.

## Existing background context and real Chrome proof

Chrome legacy hunting uses the existing service worker and creates no offscreen document. An overlapping hunt skips mining rather than delaying another payment. Inline batches adapt toward 16ms of work, followed by a real timer yield so wallet lock and RPC messages can run.

A time-limited hunt may exceed Chrome's 30-second idle lifetime. While it is active, a permission-free runtime API call at most every 20 seconds supplies [extension API activity](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). No keepalive timer survives the hunt.

We tested scheduler.yield as another permission-free optimization and rejected it: its prioritized continuations delayed extension RPC messages in the actual wallet cancellation check. Timer yields are retained.

### Fixed-k batch experiment

Three rotating-order one-second runs per variant, using the same legacy template:

| Inputs | Fixed 1,000-nonce batches | Fixed 5,000-nonce batches | Adaptive ~16ms batches |
| --- | ---: | ---: | ---: |
| 1 | 128,621/s | 245,263/s | **252,195/s** |
| 3 | 53,662/s | 81,366/s | **62,051/s** |

The larger fixed batches can improve throughput but hold the background thread longer as input count grows. Adaptive batches favor timely wallet messages. These older one-second measurements vary with machine load; the 20-second comparison above measures the final multi-input optimization. Reproduce with **scripts/bench-zeld-background.mjs**.

**scripts/prove-zeld-wallet.mjs** loads the production Chrome build in a fresh profile, verifies that its permissions are exactly the original four, creates an encrypted throwaway wallet through WalletService and invokes its actual signTransaction RPC. Only network transport is adapted: UTXOs and raw parents come from Bitcoin Core. No signer, hunt, session guard or signature validation is replaced.

The permission-free build confirmed six-zero legacy txid **0000002aaafdf824e24ea7a371fcf8c421722140bde33a6bdfe7301974e88057**: ordinary and hunted sizes were both **252 vbytes**, and both paid **506 sats**. It passed testmempoolaccept, was mined, and parsed as a supported Counterparty broadcast. The runtime observed no offscreen document or dedicated hunt worker.

The earlier fixed-k three-input proof confirmed **0000008a8442f82bd306c6bb253f39ad741eb49432d129c3e45837a5d3905cea** after 44.9 seconds. Both versions were **546 vbytes** and paid **1,098 sats**. Its lock-during-hunt check also withheld the signature.

The final signature-combination path confirmed **000000b517ae226cc6164faa8ad0f6c201e8b2516bfd6bf39482b8d92abf0775**, with three inputs and fixed locktime 0, after 45.9 seconds. Ordinary and hunted transactions were both **546 vbytes** and paid exactly **1,098 sats**. Bitcoin Core accepted and mined the transaction; Counterparty parsed its broadcast. The built wallet also passed lock-during-hunt cancellation. Three preceding 60-second runs timed out and confirmed the normal-signing fallback. A successful example is validity evidence, not an average time-to-find measurement.

Locking the wallet during another active hunt rejected its RPC and released no signature. Navigating away prevents popup broadcasting, though bounded background work can continue if the session remains valid. Legacy signing shows the time budget; live hash progress and immediate continue are available during unsigned hunting.

## Wallet/protocol validation

**e2e/zeld/regtest-wallet-flow.test.ts** calls production compose, protocol verification, hunting and signing functions. It confirmed native, nested, Taproot and legacy broadcasts while checking output scripts/amounts, final sequences and exact fees. An enhanced XCP send credited its recipient with 100,000,000 base units. A legacy timeout exercised ordinary-signing fallback successfully.

All six existing regtest scenarios also passed: native hunt, nested hunt, legacy enhanced send, dispenser ordering, UTXO shapes and parking before ownership transfer. The shared helper now calls the production transaction signer, replacing its copied signer.

The Bitcoin/Counterparty nodes are real. ZELD indexer answers in existing parking/protection tests are simulated from regtest output ownership: these do not prove live indexer credit or a reward payout. Some scenarios use faster four-zero targets; built legacy wallet proofs use the production six-zero target and 60-second cap.

### Reproduce in PowerShell

    docker compose -p zeld-wallet-proof -f e2e/zeld/docker-compose.yml up -d
    $env:ZELD_REGTEST='1'
    $env:ZELD_REGTEST_BITCOIND='http://127.0.0.1:28443'
    $env:ZELD_REGTEST_COUNTERPARTY='http://127.0.0.1:34000'
    $env:ZELD_REGTEST_ZEROS='4'
    $env:ZELD_REGTEST_CASES_OUT='test-results/zeld-wallet-cases.jsonl'
    npx vitest run e2e/zeld --maxWorkers=1 --retry=0
    npm run build
    $env:ZELD_PROOF_INPUTS='3'
    node scripts/prove-zeld-wallet.mjs
    node scripts/bench-zeld.mjs
    node scripts/bench-zeld-legacy.mjs
    node scripts/bench-zeld-background.mjs
    node scripts/bench-zeld-pool-production.mjs

The stack binds local-only non-default ports. Helpers refuse to fund any chain except regtest. Set ZELD_PROOF_INPUTS to 1 or 3. Test keys are fresh; broadcasts go only to local Bitcoin Core.

## UI and organization

- **Enable ZELD Hunting** toggle in Advanced settings. The ZELD balance page also has the maximum wait control.
- Clear unchanged-fee wording, device-processing cost and no guaranteed find.
- Extracted HuntProgress: countdown, elapsed-time bar, rate, saved-result status and immediate continue. The progress bar measures time, not probability.
- Actual elapsed time in review after early stop; stable accessibility announcements.
- Small eligibility module independent of signing; separate balance-fetching hook.

The final layout and off → on → off → on persistence were checked in the built Chrome wallet. Advanced has no time input; the ZELD balance page shows the saved 15-second value. Both pages were captured for visual review. Component tests cover validation and toggling.

The balance screenshot deliberately shows the unavailable state: `prove-zeld-wallet.mjs` blocks public HTTP requests and supplies only regtest Bitcoin transport responses. It is not evidence of a live ZELD outage. A subsequent live API check found and fixed an independent rewards-client bug: `sort=desc` is rejected with HTTP 400 (omit it for newest-first ordering), and the specific HTTP 404 `No rewards found for address.` means an empty history. The earlier mocked test incorrectly expected the unsupported parameter. The corrected production client successfully fetched a known address's balance/rewards and handled a no-rewards address; 11 targeted API/hook tests, TypeScript and lint passed. One separate address lookup returned an upstream Electrum HTTP 502 while other balance lookups returned 200, so individual upstream failures remain possible.

## Validation and remaining scope

294 targeted unit/component tests passed across 28 files, including compressed/uncompressed signature combinations, cancellation during preparation, bounded preparation, numeric discipline and scriptSig tamper rejection. Seven regtest scenarios and built Chrome wallet proofs cover the integration. TypeScript, lint, Chrome build and Firefox build passed. Existing lint/bundle-size warnings remain.

Hardware-device signing and live-mainnet reward credit were not exercised. Further work could reduce consolidation in explicit ZELD sends and improve handling of incomplete indexer data. Ordinary inherited ZELD cannot always be detected from txid rarity alone during an indexer outage.

Recorded benchmark samples and public regtest evidence are preserved in [e2e/zeld/review-results.json](e2e/zeld/review-results.json). Temporary regtest services were stopped after validation; their containers retain the chain for inspection.
