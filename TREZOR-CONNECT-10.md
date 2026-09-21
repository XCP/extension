# Trezor Connect 10 beta 3

Draft migration of the current wallet to `@trezor/connect-webextension@10.0.0-beta.3`.
The Node emulator SDK and its explicit Bridge transport use the same version.
This branch includes `main` through `da63b07c` (including the ZELD and provider signing work).

## Integration

- Use the shipped SDK types; remove the handwritten v9 module declaration and duplicated
  signing request types. This exposed and fixes the adapter's `lock_time`/`locktime` mismatch.
- Use the v10 error envelope, nested device/passphrase option, and `btc` coin symbol.
- Use `selectAccount` for discovery. Request the full account and read its `/0/0` address
  explicitly, so a later fresh address cannot be stored against the wrong signing path.
- Keep SDK calls and connection reset in the background wallet service, including the manual
  hardware message-signing page. Preserve wallet session guards and verified PSBT signatures.
- Use `coreMode: auto`: Suite desktop when available, Suite Web otherwise. Connect 10 no longer
  supports the legacy `popup` mode or public device-event subscriptions.
- Replace the old Connect/Bridge host permissions with `https://suite.trezor.io/*` and its
  `externally_connectable` allowlist. The SDK needs host access to read its own Suite tab URL.
  Remove `scripting`, which the v10 external-message flow no longer uses.
- Remove the obsolete build-time emulator flag. Emulator tests explicitly construct a
  `BridgeTransport` and use beta 3's `UI_EVENTS.BUTTON_REQUEST` event.

## Validation

- Type checking and lint passed (lint remains within the existing budgets).
- 176 hardware, PSBT, wallet, and message-signing unit tests passed.
- All 14 emulator integration tests passed against the pinned Trezor user environment.
  These include message signing, legacy/native/nested address derivation, real device
  signatures, supported presigned external inputs, and rejection of unsupported inputs.
- The emulator also exercises the actual wallet adapter with a nonzero locktime. Only the
  Suite transport boundary and synthetic previous-transaction lookup are supplied by the test;
  Connect signs on the emulator and the wallet verifies/reconstructs the signed PSBT.
- Built Chrome extension: Suite Web handshake and cancellation passed with the real SDK
  and a controlled Suite page (no physical device).
- Chrome MV3 and Firefox MV2 production builds passed. `npm audit` reports zero advisories.

## Release gates

This remains a draft. A successful build is not physical-device or Suite-host certification.

- Test actual Suite desktop and Suite Web with a physical device, including hidden wallets,
  reconnect, cancellation and signing in the installed extension.
- **Firefox Suite Web is blocked:** the v10 webextension SDK exclusively uses website-to-extension
  external messaging, which Firefox does not support. Choose a Firefox compatibility strategy
  or obtain upstream support before shipping this migration. A Firefox build alone is insufficient.
- Connect 10 is still a prerelease; `latest` remains 9.7.3.

## Sources

- [Connect beta 3 migration guide](https://connect.trezor.io/10.0.0-beta.3/guides/migrating-to-connect-10)
- [Trezor webextension integration](https://github.com/trezor/trezor-suite/tree/develop/packages/connect-webextension)
- [Firefox external messaging limitations](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/externally_connectable)
