# Contributing

How to set up, build, test, translate and release XCP Wallet. The code map, trust boundaries and
signing lifecycle are in [ARCHITECTURE.md](ARCHITECTURE.md); the website API is in
[PROVIDER.md](PROVIDER.md).

XCP Wallet is a Manifest V3 extension built for Chrome (Chromium) only.

## Setup

Use Node 24 and npm 11 (`package.json` `engines`; `.nvmrc` pins the Node version CI uses).

```bash
npm install        # plain install: never --legacy-peer-deps, it prunes @testing-library/dom
```

Dependencies are pinned to exact versions, and CI fails on a range (`^`, `~`, `*`, ...).

### The lockfile

CI installs with `npm ci`, which builds from `package-lock.json` alone and fails if the lock does
not record everything the tree needs. `lint`, `compile` and the tests all run against your
existing `node_modules`, so they pass either way. After changing `package.json` or
`package-lock.json`, run:

```bash
npm run check:lockfile
```

**Regenerate the lockfile with Linux npm.** npm on Windows drops platform-specific optional
entries (such as `@emnapi/core`, `@emnapi/runtime` and `@emnapi/wasi-threads`) that CI's Linux
`npm ci` requires, and every CI job then fails with "Missing: ... from lock file". Start from
`main`'s lock, make the `package.json` change, and regenerate it in a `node:24` container:

```bash
tar cf - package.json package-lock.json \
  | docker run --rm -i node:24 sh -c 'mkdir /app && cd /app && tar xf - \
      && npm install --package-lock-only --ignore-scripts >&2 \
      && npm ci --ignore-scripts >&2 \
      && cat package-lock.json' > package-lock.new.json
mv package-lock.new.json package-lock.json
```

Streaming the files over stdin avoids bind-mounting a Windows path. Then check that `npm ci` also
succeeds locally.

## Building

```bash
npm run dev        # development build with reload, loaded into Chrome by WXT
npm run build      # production build in .output/chrome-mv3
npm run build:e2e  # the build the browser tests load (see below)
npm run zip        # production build zipped as .output/xcp-wallet-X.Y.Z-chrome.zip
```

`build:e2e` differs from `build` in one way: it grants the optional `https://suite.trezor.io/*`
host permission at install, because automation cannot answer the prompt a normal build shows on
first Trezor use. Never ship it.

## Testing

```bash
npm run compile                                           # tsc --noEmit
npm run lint                                              # Biome, Oxlint, promise rules, lint:i18n
npx vitest run src/platform/__tests__/proxy.test.ts --retry=0
npm run build:e2e
npx playwright test e2e/tests/provider-message-signing.spec.ts
```

`npm test` (the unit suite) and `npm run test:e2e` (an e2e build, then every Playwright spec) run
the full suites; the e2e suite takes well over an hour serially, so CI shards it. Locally, prefer
the tests your change affects.

- **Unit tests** are Vitest files next to the code under `src`.
- **Browser tests** are Playwright specs under `e2e/`. They load `.output/chrome-mv3`, so run
  `npm run build:e2e` first and again after every source change. How to write them, and the
  fixtures to use, is in [e2e/TESTING-GUIDE.md](e2e/TESTING-GUIDE.md).
- **Run one Playwright job at a time.** Each test launches its own Chromium profile, and
  concurrent runs share the build output and `test-results/` (each run wipes it), so they fail in
  ways that look like flakiness.

`npm run lint` rejects any increase in the per-file, per-rule warning budgets in
`lint-baseline.json`. After fixing warnings, run `npm run lint:prune` to lower those budgets; it
cannot add allowances.

### Trezor emulator

`e2e/hardware/` tests Trezor signing against Trezor's emulator (`trezor-user-env`) and is skipped
unless `TREZOR_EMULATOR_AVAILABLE=1`. Disconnect any physical Trezor and stop any local Trezor
Bridge first, since the emulator's bridge uses the same port.

```bash
docker compose -f docker-compose.trezor.yml up -d     # emulator controller :9001, bridge :21325
node e2e/hardware/init-trezor-emulator.js             # start the emulator and bridge with the test seed

TREZOR_EMULATOR_AVAILABLE=1 npm run test:emulator     # TrezorConnect against the emulator (Vitest)

npm run build:e2e
TREZOR_EMULATOR_AVAILABLE=1 npx playwright test e2e/hardware/trezor.spec.ts

docker compose -f docker-compose.trezor.yml down
```

### ZELD regtest

`e2e/zeld/` holds Vitest proofs that run the wallet's ZELD code against Bitcoin Core and
Counterparty Core on regtest. They are skipped unless `ZELD_REGTEST=1`. `e2e/zeld/docker-compose.yml`
starts both, publishing Bitcoin Core's RPC on port 28443 and the Counterparty API on 34000; the
harness defaults to 18443 and 24000, so point it at the containers:

```bash
docker compose -f e2e/zeld/docker-compose.yml up -d

ZELD_REGTEST=1 \
ZELD_REGTEST_BITCOIND=http://127.0.0.1:28443 \
ZELD_REGTEST_COUNTERPARTY=http://127.0.0.1:34000 \
  npx vitest run e2e/zeld --no-file-parallelism

docker compose -f e2e/zeld/docker-compose.yml down
```

The files share one chain, so run them without file parallelism. Some files take further
variables (for example `ZELD_REGTEST_ZEROS` in `regtest-hunt.test.ts`); each file's header says
which.

## CI

Pull requests to `main` run `.github/workflows/pr-tests.yml`:

- a check that every dependency is pinned to an exact version;
- type checking, lint (including the translation checks) and a production build;
- the unit tests and the Playwright suite, each split across parallel jobs, the browser tests
  against a `build:e2e` build;
- `npm audit` of production dependencies, which fails on any high or critical advisory.

A pull request that changes only Markdown, `docs/` or `LICENSE` skips the test suites, and a draft
skips the browser tests until it is marked ready. A change to the hardware code also runs the
Trezor emulator workflow. A scheduled workflow runs the full suite, including the fuzz tests and
the compose checks against Counterparty Core, on a regular schedule and opens an issue when it
fails.

## Languages

English, Japanese, Simplified Chinese, and Traditional Chinese (Taiwan and Hong Kong) catalogs
ship in `public/_locales/`. The wallet follows Chrome's interface language; how the catalogs are
selected at runtime is in [src/i18n/README.md](src/i18n/README.md).

**The source of truth is `public/_locales/en/messages.json`.** Every other catalog is a
translation of it:

| Catalog | What it is |
|---|---|
| `ja` | Japanese translation |
| `zh_CN` | Simplified Chinese translation, and the source for the other Chinese catalogs |
| `zh` | An exact copy of `zh_CN`. Chrome falls back from an unmatched regional Chinese locale (such as `zh_SG`, or a bare `zh`) to `zh`, and without it those users would see English |
| `zh_TW`, `zh_HK` | Derived from `zh_CN`: OpenCC's Taiwan and Hong Kong phrase tables, then the shared glossary's renderings and known OpenCC fixes. The reference implementation is `apps/web/scripts/i18n-derive-zh.mjs` in [XCP/launchpad](https://github.com/XCP/launchpad), which reads that repository's catalog layout |

### Adding or changing text

1. Write the English in `public/_locales/en/messages.json`. Give each entry a `description`
   saying where the text appears and what each `$1` stands for. That is all a translator sees.
2. Use it in code with `t('key')` from `@/i18n`. Keys are typed, so a misspelled key fails to
   compile.
3. Run `node scripts/i18n.mjs build` to regenerate those types (`src/i18n/en.generated.ts`).
4. Add the key, with a `message` only, to `ja` and `zh_CN`. Copy the `zh_CN` text unchanged into
   `zh`, and write `zh_TW` and `zh_HK` as the regional conversion of that `zh_CN` text, not as
   separate translations. Change Chinese wording in `zh_CN` first and carry it to the others.
5. List the key under `machine` in `src/i18n/status/<locale>.json` for every locale you added it
   to, until a native speaker has checked it.
6. `npm run lint` checks the catalogs (`lint:i18n`). It fails on keys that are missing, unused, or
   have different placeholders than the English; on numbers formatted in a fixed locale; and on
   approval-screen labels too long to fit on one line (see
   [Approval screens](docs/approval-screens.md#label-length-is-enforced)).

### Reviewing a translation

`node scripts/i18n.mjs review ja --machine > review-ja.md` writes the unchecked strings as a
table: the English, the translation, and where each appears. Once a native speaker has checked a
string, remove it from `machine` in `src/i18n/status/ja.json`.

## Releasing

1. Bump the version in a pull request:

   ```bash
   npm version X.Y.Z --no-git-tag-version   # bumps package.json AND package-lock.json
   ```

   Use `npm version`, not a hand edit of `package.json`: the lockfile records the version too,
   and CI builds from the lockfile alone.
2. After it merges, build the package from `main`:

   ```bash
   npm ci
   npm run zip                              # .output/xcp-wallet-X.Y.Z-chrome.zip
   ```
3. Upload the zip through the Chrome Web Store developer dashboard. A new submission replaces any
   pending review rather than queueing behind it, so check that the previous version has
   published before uploading the next one.
4. Tag the commit you built as `vX.Y.Z`, push the tag, and publish a GitHub release for it with
   release notes, the zip, and a `SHA256SUMS.txt` of the zip.
