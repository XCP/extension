import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const APPROVAL_SOURCES = [
  'src/services/providerService.ts',
  'src/hooks/useSignMessageRequest.ts',
  'src/hooks/useSignTransactionRequest.ts',
  'src/hooks/useSignPsbtRequest.ts',
  'src/hooks/useSignPsbtsRequest.ts',
] as const;

describe('provider approval routing', () => {
  it.each(APPROVAL_SOURCES)('keeps each popup bound to its URL request ID in %s', (path) => {
    const source = readFileSync(path, 'utf8');

    // Every signing flow opens its own popup. A process-wide navigation broadcast lets an older
    // popup display or sign a second request while still completing under the ID in its URL.
    expect(source).not.toMatch(
      /NAVIGATE_TO_(?:SIGN_MESSAGE|APPROVE_TRANSACTION|APPROVE_PSBTS?)/
    );
  });
});
