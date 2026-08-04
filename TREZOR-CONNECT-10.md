# Trezor Connect 10 migration

Migration to `@trezor/connect-webextension@10.0.0-beta.1`, done so it can land as soon as a
stable v10 ships. Everything compiles, lints, builds and passes unit tests today. What it cannot
do from this machine is exercise a physical device, so the emulator suites are the gate.

## What it buys

`npm audit` goes from 11 low advisories to **zero**. All 11 were one root cause — `elliptic`
GHSA-848j-6mx2-7j84 — counted once per package in the chain. v10 drops `@trezor/connect` from
connect-webextension's dependency list, and with it `crypto-browserify` → `elliptic` and
`utxo-lib` → `tiny-secp256k1` → `elliptic`.

The shipped bundle is also smaller: 2.46 MB → 2.38 MB.

To be clear about the size of the win: `elliptic` never reached the shipped extension under 9.x
either. It was tree-shaken out, and our signing uses `@noble/secp256k1` and `@scure/btc-signer`.
So this cleans up the advisory list and the build graph, not a live exposure.

## The emulator

**It keeps working, through `@trezor/connect` rather than `connect-webextension`.**

v10 splits the API in two. `connect-webextension` exposes `TrezorConnectPublicAPI`, whose
`init()` takes only `manifest`, `version`, `env`, `debug`, `enabledNetworks`,
`requestedPermissions` and `coreMode` — no `transports`, so it cannot be pointed at a bridge.
`@trezor/connect` exposes `TrezorConnectPrivilegedAPI`, which is
`TrezorConnectCore<ConnectSettings> & TrezorConnectInternal & TrezorConnectCallable`: the full
settings type including `transports: ['BridgeTransport']`, plus `on`, `uiResponse`,
`updateConnectSettings` and the management methods.

That maps onto how the emulator was already being driven. `e2e/hardware/trezor-node-integration.test.ts`
is the suite that verifies device communication, address derivation and message signing, and it
drives `@trezor/connect` directly over the Bridge. The browser-side operations tests were already
documented in `trezor-emulator-tests.yml` as "Limited (expected)", because connect-webextension's
popup architecture cannot talk to BridgeTransport — that was true under 9.x too.

So this change **un-quarantines** that suite. It was skipped in 215f8c54 when the earlier
10.x-alpha attempt dropped `@trezor/connect`; re-adding it at `10.0.0-beta.1` as a devDependency
restores it, and `npm audit` still reports zero — the v10 `utxo-lib` no longer carries
`tiny-secp256k1`.

`e2e/trezor-emulator.ts` needed no changes at all: it controls the emulator over plain HTTP
(`localhost:21325/enumerate`, the emulator's own HTTP API), independent of Connect.

Still open: `trezor.spec.ts` → "shows Trezor popup when connecting" stays `test.fixme`'d. It was
disabled because 10.x-alpha threw during connect in headless CI. Whether beta.1 fixes that can
only be settled by running the emulator workflow, so it is left as-is rather than flipped blind.

## The change

All API breakage was contained in `src/utils/hardware/trezorAdapter.ts`. Deleting
`src/types/trezor-connect.d.ts` is what exposed it — that file was a hand-written stub of the v9
surface, so the compiler could never report that the surface had changed. v10 ships real types.

**Mechanical**

- `Err` no longer carries `payload`. v9 `{ success: false, payload: { error, code } }` became
  v10 `{ success: false, error: { message, code } }` — 29 sites.
- `useEmptyPassphrase` moved under `device`: `{ device: { useEmptyPassphrase } }`.
- `pingDevice` moved into `TrezorConnectManagement`, which the public API omits. `getFeatures`
  answers the same question — is the device reachable — without a device confirmation.
- `getAddress` / `getPublicKey` split `path` and `bundle` into separate overloads.

**Structural**

- **Device events are gone.** `on`, `off`, `removeAllListeners` and `uiResponse` are absent from
  the public API, and there is no subscription API to replace them. `connectionStatus` and
  `deviceInfo` are now established by the first `getDeviceInfo()` / `pingDevice()` call instead of
  being pushed from `DEVICE.CONNECT` / `DEVICE.DISCONNECT`.
- **Discovery moved to `selectAccount`.** `getAccountInfo` now rejects a request carrying neither
  `path` nor `descriptor`, so it can no longer start discovery. `selectAccount` returns `path`,
  `address` and `xpub` directly — which also retires `extractXpubFromDescriptor`, since the xpub
  no longer has to be parsed out of a descriptor string.
- **`coin` is a typed symbol union.** Two call sites passed the v9 long name `'Bitcoin'`, which is
  not in that union and would have failed on-device. Since this wallet only ever signs Bitcoin,
  `coin` was dropped from `HardwareMessageSignRequest` and pinned to `'btc'` in the adapter.
- **`events` polyfill added.** v10's `@trezor/utils` imports `EventEmitter` from Node's `events`,
  which vite resolves to `__vite-browser-external` and fails the background build. The `events`
  package (pure JS, no dependencies) supplies it.
- `TrezorAdapterOptions` lost `testMode`, `connectSrc` and `onButtonRequest` — all three only
  configured transport settings or event subscriptions that no longer exist.

## Verification

- `tsc --noEmit` clean
- `biome check src` clean across 678 files
- `wxt build` succeeds; bundle 2.46 MB → 2.38 MB
- `vitest run src/utils/hardware src/utils/wallet` — 139 passed, 11 skipped (the emulator suite,
  which needs a local emulator on port 9001)
- `playwright test e2e/pages/compose/broadcast/index.spec.ts` — 10 passed
- No `elliptic`, `tiny-secp256k1` or `browserify-sign` in any file under `.output/chrome-mv3`

Not verified here, and the reason this waits for a stable release: nothing in the above touches a
real device. The emulator workflow (`trezor-emulator-tests.yml`) is what proves signing still
works, and it has to pass before this merges.
