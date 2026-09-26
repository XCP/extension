# Architecture decision records

Each record was written as a comment next to the code it governs, and the comment is still there.
These pages copy that text so the decisions can be read and linked without opening the source; the
code comment is the original.

| ADR | Decision | Code |
|-----|----------|------|
| [ADR-001](ADR-001.md) | JavaScript memory clearing limitation (accepted) | [sessionManager.ts](../../src/platform/auth/sessionManager.ts) |
| [ADR-002](ADR-002.md) | No automatic key refresh during a session (accepted) | [sessionManager.ts](../../src/platform/auth/sessionManager.ts) |
| [ADR-003](ADR-003.md) | No distributed tracing (future enhancement) | [MessageBus.ts](../../src/services/core/MessageBus.ts) |
| [ADR-005](ADR-005.md) | Explicit service dependency ordering | [BaseService.ts](../../src/services/core/BaseService.ts) |
| [ADR-008](ADR-008.md) | Storage error handling pattern (cited in code; no standalone record) | [requestStorage.ts](../../src/platform/storage/requestStorage.ts), [sessionMetadataStorage.ts](../../src/platform/storage/sessionMetadataStorage.ts) |
| [ADR-010](ADR-010.md) | Storage pattern decisions (class vs function) | [requestStorage.ts](../../src/platform/storage/requestStorage.ts) |
| [ADR-013](ADR-013.md) | Constants organization strategy | [constants.ts](../../src/core/wallet/constants.ts) |
| [ADR-014](ADR-014.md) | Input validation thresholds for encryption | [encryption.ts](../../src/core/encryption/encryption.ts) |
| [ADR-015](ADR-015.md) | Unified keychain architecture | [walletManager.ts](../../src/platform/walletManager.ts) |
| [ADR-016](ADR-016.md) | Privacy-focused analytics with Fathom | [fathom.ts](../../src/platform/fathom.ts) |
| [ADR-017](ADR-017.md) | Hardware wallet integration architecture | [trezorAdapter.ts](../../src/core/hardware/trezorAdapter.ts) |
| [ADR-018](ADR-018.md) | Explicit, identity-bound paired-address provider capability | [providerService.ts](../../src/services/providerService.ts) |
| [ADR-019](ADR-019.md) | The composer is untrusted, and verification is structural | [verify.ts](../../src/core/counterparty/unpack/verify.ts) |

Numbers 004, 006, 007, 009, 011 and 012 are not recorded anywhere in the code and are not listed.

To add a record, write it where the decision is implemented, give it the next number, and copy it
here. `docs/adr/` is whitelisted in `.gitignore`; any other new page under `docs/` needs its own `!docs/...` line there.
