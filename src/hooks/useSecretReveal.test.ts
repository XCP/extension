import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSecretReveal } from './useSecretReveal';

const form = (password?: string) => {
  const fd = new FormData();
  if (password !== undefined) fd.set('password', password);
  return fd;
};

describe('useSecretReveal', () => {
  let verifyPassword: ReturnType<typeof vi.fn>;
  let onVerified: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    verifyPassword = vi.fn().mockResolvedValue(true);
    onVerified = vi.fn().mockResolvedValue(undefined);
  });

  // Takes walletId explicitly: a default parameter would swallow the `undefined`
  // that the no-wallet case is specifically about.
  const setup = (walletId: string | undefined) =>
    renderHook(() => useSecretReveal({ walletId, verifyPassword, onVerified }));

  it('reveals once the password verifies', async () => {
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));

    await waitFor(() => expect(result.current.isRevealed).toBe(true));
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(result.current.submissionError).toBe('');
  });

  it('does not reveal, or even try, without a wallet', async () => {
    const { result } = setup(undefined);
    await act(() => result.current.formAction(form('correct horse battery')));

    expect(result.current.submissionError).toBe('Invalid wallet.');
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
    expect(result.current.isRevealed).toBe(false);
  });

  it('rejects a short password without asking the verifier', async () => {
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('short')));

    expect(result.current.submissionError).toMatch(/at least \d+ characters/);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('requires a password', async () => {
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form()));

    expect(result.current.submissionError).toBe('Password is required.');
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  // The secret must stay unreachable on every failing path, including the one
  // where the verifier itself blows up rather than returning false.
  it('does not reveal when the password is wrong', async () => {
    verifyPassword.mockResolvedValue(false);
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));

    expect(result.current.submissionError).toBe('Incorrect password.');
    expect(onVerified).not.toHaveBeenCalled();
    expect(result.current.isRevealed).toBe(false);
  });

  it('treats a throwing verifier as a failed verification, not a passing one', async () => {
    verifyPassword.mockRejectedValue(new Error('storage exploded'));
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));

    expect(result.current.submissionError).toBe('Incorrect password.');
    expect(onVerified).not.toHaveBeenCalled();
    expect(result.current.isRevealed).toBe(false);
  });

  it('stays unrevealed and shows the thrown message when retrieval fails', async () => {
    onVerified.mockRejectedValue(new Error('Unable to retrieve recovery phrase.'));
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));

    expect(result.current.submissionError).toBe('Unable to retrieve recovery phrase.');
    expect(result.current.isRevealed).toBe(false);
  });

  it('clears a previous error on the next attempt', async () => {
    verifyPassword.mockResolvedValueOnce(false);
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));
    expect(result.current.submissionError).toBe('Incorrect password.');

    await act(() => result.current.formAction(form('correct horse battery')));
    await waitFor(() => expect(result.current.isRevealed).toBe(true));
    expect(result.current.submissionError).toBe('');
  });
});
