/**
 * The errors a provider method throws back to a site, and the adapter that turns a wallet
 * validator's refusal into one.
 */

import { JSON_RPC_ERROR_CODES, PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';

/**
 * dApp-facing failures. A plain Error is masked to -32603 "Request failed" at the page boundary
 * (classifyProviderError), so anything a site should be able to read or branch on is thrown as a
 * ProviderError. Only fixed, deliberately user-facing text goes in these, never internal state.
 *
 * - invalidParams (-32602): the request's own shape or content is wrong; resending it unchanged fails.
 * - limitExceeded (-32005, EIP-1474): a per-origin limit; the message says when to try again.
 * - expired (4001): nobody approved within the request's window. EIP-1193 has no timeout code, and
 *   the outcome is the same as a rejection: nothing was approved and the site should not assume
 *   anything happened. 4001 is the code sites already handle as "the user did not go ahead".
 */
export const invalidParams = (message: string) => new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, message);
export const limitExceeded = (message: string) => new ProviderError(JSON_RPC_ERROR_CODES.LIMIT_EXCEEDED, message);
export const expired = (message: string) => new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, message);

/**
 * Connected, but the wallet has no active address to act for: it is locked (a locked wallet keeps
 * its identity and drops its addresses) or not set up. The contract's 4100, so a site prompts the
 * user to unlock instead of treating it as an internal failure.
 */
export const walletLocked = () => new ProviderError(
  PROVIDER_ERROR_CODES.UNAUTHORIZED,
  'Wallet is locked or not set up. Unlock XCP Wallet and try again.',
);

/**
 * Run a validator over what the site sent and report its refusal as -32602. The wallet's own
 * validators (intent parsers, signing-request checks) throw plain Errors whose fixed text names
 * the problem in terms of the request, so that text is surfaced. Only a plain Error is converted:
 * a ProviderError keeps its own code, and anything else (a TypeError from a bug, a library's own
 * error class) stays masked as -32603 so its text never reaches the site.
 */
export function asInvalidParams<T>(validate: () => T, prefix = ''): T {
  try {
    return validate();
  } catch (error) {
    if (error instanceof Error && error.constructor === Error) throw invalidParams(`${prefix}${error.message}`);
    throw error;
  }
}
