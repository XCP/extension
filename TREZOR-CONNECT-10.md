# Trezor Connect 10 migration — findings

Spike branch. **Not mergeable**: `tsc` fails by design, and the change would remove our only
automated verification of the hardware signing path. Written up so the work is ready when
v10 goes stable.

Measured against `@trezor/connect-webextension@10.0.0-beta.1` (`latest` is still `9.7.3`).

## What it buys

`npm audit` goes from 11 low advisories to **zero**. All 11 are one root cause — `elliptic`
GHSA-848j-6mx2-7j84 — counted once per package in the chain. v10 drops the dependency that
carried it:

| | 9.7.3 | 10.0.0-beta.1 |
|---|---|---|
| direct deps | `@trezor/connect`, `@trezor/connect-web`, `@trezor/connect-common` | `@trezor/connect-common`, `@trezor/connect-web` |
| pulls | `blockchain-link` → `crypto-browserify` → `elliptic`, `utxo-lib` → `tiny-secp256k1` → `elliptic` | none of it |

The `@trezor/connect` package is gone from the tree, and with it the whole vulnerable subtree.

## What it costs

`elliptic` never reaches the shipped extension. Grepping every JS file in `.output/chrome-mv3`
for `elliptic`, `tiny-secp256k1`, `browserify-sign` and `create-ecdh` returns nothing — it is a
build-graph artifact, tree-shaken out. Our signing uses `@noble/secp256k1` and
`@scure/btc-signer`; the Trezor path signs on-device and `trezorAdapter` is transport only,
pointing at `connect.trezor.io`.

So the advisory count improves and the shipped attack surface does not change.

## Breakage

68 `tsc` errors, all in `src/utils/hardware/trezorAdapter.ts`. Nothing else in the codebase
touches the Trezor API. Reproduce with:

```
npm install @trezor/connect-webextension@10.0.0-beta.1 --save-exact
rm src/types/trezor-connect.d.ts     # v10 ships real types; ours is a hand-written stub
npx tsc --noEmit
```

That stub is why none of this was visible before: we declared the v9 surface ourselves, so the
compiler could not tell us when it stopped existing.

### Mechanical — safe, and `tsc` confirms each one

- **Result shape (29 sites).** `Err` no longer carries `payload`:
  v9 `{ success: false, payload: { error, code } }` → v10 `{ success: false, error: { message, code } }`.
  So `result.payload.error` becomes `result.error.message`.
- **`pingDevice` → `getFeatures`.** `pingDevice` moved into `TrezorConnectManagement`, which the
  public API `Omit`s. `getFeatures` survives and already backs `getDeviceInfo()`.
- **`getAddress` / `getPublicKey` param shapes.** `path` and `bundle` are now separate overloads
  rather than one permissive object, and `useEmptyPassphrase` is gone from the bundled form.
- **`getAccountInfo`** requires an explicit `path` or `descriptor`; `coin` alone no longer works.
- **`coin: 'Bitcoin'`** at `trezorAdapter.ts:886` must become `'btc'`. Every other call site
  already passes `'btc'`.

### Design decisions — not mechanical, and untestable without a device

- **Device events are gone.** `on`, `off`, `removeAllListeners` and `uiResponse` are absent from
  `TrezorConnectPublicAPI`. We use them to keep `connectionStatus` and `deviceInfo` current from
  `DEVICE.CONNECT` / `DEVICE.DISCONNECT`. There is no subscription API to replace them, so that
  state has to be derived by polling `getFeatures`. The `DEVICE_EVENT` constant still exports,
  but nothing consumes it.
- **The emulator transport cannot be configured.** This is the blocker. `init()` on
  connect-webextension v10 takes `ConnectDynamicSettings = Partial<ConnectImplSettings>`, which is
  only `manifest`, `version`, `env`, `debug`, `enabledNetworks`, `requestedPermissions`, `coreMode`.
  Our emulator mode sets `popup`, `transports: ['BridgeTransport']`, `pendingTransportEvent`,
  `transportReconnect` and `connectSrc` — none of which that type accepts. They live in
  `ConnectSettings`, reachable only through the privileged API. The package exports a single
  entrypoint with no escape hatch.

## Why this should wait

`trezor-emulator-tests.yml` verifies device communication, address derivation and message signing
against the emulator, using exactly the settings v10 removes. Migrating now means rewriting the
hardware signing path and deleting its automated verification in the same change — against a beta,
to fix advisories that never ship.

Revisit when v10 is stable and there is a supported way to point it at the emulator. The mechanical
list above still applies and is the bulk of the work.
