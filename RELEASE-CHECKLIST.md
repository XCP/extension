# Release Checklist

Run top to bottom. Each step says what to check and what a bad answer looks like, because the
failures worth catching are the ones that still look fine.

---

## 1. Decide the version

- [ ] Patch for fixes only; minor when behaviour users rely on changes, or when something that
      never worked starts working
- [ ] `git log --oneline vX.Y.Z..main` — read every line and confirm the version matches the
      largest change in it, not the average one

## 2. Gates

All must pass on `main` before anything is tagged.

- [ ] `npx tsc --noEmit` — clean
- [ ] `npx biome check src` — clean
- [ ] `npx vitest run src` — no failures
- [ ] `npx wxt build` — succeeds
- [ ] CI green on `main`

Known-noise, do not treat as blockers:

- `trezorAdapter.emulator.test.ts` fails locally without an emulator on `localhost:9001`
- The Trezor emulator suite needs a device or emulator and does not run locally
- Single E2E batch failures are usually runner flakes. Confirm by running that spec locally
  before rerunning CI — if it passes locally on the same branch it is a flake, so
  `gh run rerun <id> --failed`. If it fails locally it is real.

## 3. Dependency audit

- [ ] `npm audit` — 0 critical, 0 high, 0 moderate
- [ ] Any remaining lows are the known `elliptic` chain (GHSA-848j-6mx2-7j84) reached through
      `@trezor/connect-webextension`, which has no upstream fix
- [ ] Confirm it is still tree-shaken out: nothing under `.output/chrome-mv3` matches
      `elliptic`, `tiny-secp256k1`, `browserify-sign`
- [ ] A *new* advisory outside that chain blocks the release

## 4. Documentation matches the code

The step most often skipped, and the one that quietly makes the docs lie.

- [ ] `PROVIDER.md` documents every `case 'xcp_*'` in `providerService.ts`, and documents none
      that no longer exist
- [ ] `AUDIT.md` reflects what the code now does. It is a security-posture claim, so understating
      it is as wrong as overstating it
- [ ] `SECURITY.md` disclosure process and contact still correct
- [ ] `README.md` install and build steps still correct
- [ ] Any ADR referenced in a comment still describes the code that cites it

## 5. Version bump and package

- [ ] Bump `version` in `package.json` — wxt reads it, and it names the zip
- [ ] `npm run zip`
- [ ] Confirm `.output/xcp-wallet-X.Y.Z-chrome.zip` exists and the name matches the version
- [ ] Confirm `.output/chrome-mv3/manifest.json` shows the new version and `manifest_version: 3`
- [ ] Record the SHA-256 of the zip

## 6. GitHub release

- [ ] Tag `vX.Y.Z`
- [ ] Asset `xcp-wallet-X.Y.Z-chrome.zip`, labelled "Chrome MV3 extension package"
- [ ] Notes carry **Highlights**, **Package (SHA-256)**, **Validation**, and a compare link
- [ ] Highlights are written for someone deciding whether to update, not as a list of PR titles
- [ ] Create as a **draft** first and read it back before publishing

## 7. Chrome Web Store

- [ ] **Confirm no prior submission is still pending review.** Submitting while one is pending
      REPLACES it and loses the queue position
- [ ] Submit only after the GitHub release is published
- [ ] Record the submission date

## 8. After publishing

- [ ] Tag points at the commit that was actually built
- [ ] Draft release promoted, not left as a draft
- [ ] Note anything deliberately left out of the release and why, so the next one does not
      rediscover it

---

## Standing exclusions

Things that stay out of a release regardless of how green they look:

- Beta or pre-release dependencies on the signing or hardware path
- Changes that cannot be exercised by any test on this machine or in CI, unless the risk is
  written down and accepted deliberately
- Version bumps of major dependencies bundled with other work — they belong in their own change
  so a regression has one suspect
