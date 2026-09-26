import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useSecretReveal } from './useSecretReveal';

const form = (password?: string) => {
  const fd = new FormData();
  if (password !== undefined) fd.set('password', password);
  return fd;
};

describe('useSecretReveal', () => {
  // Typed rather than ReturnType<typeof vi.fn>, which infers Mock<Constructable | Procedure> and
  // matches no call signature the hook accepts.
  let reveal: Mock<(password: string) => Promise<boolean>>;

  beforeEach(() => {
    reveal = vi.fn<(password: string) => Promise<boolean>>().mockResolvedValue(true);
  });

  // Takes walletId explicitly: a default parameter would swallow the `undefined`
  // that the no-wallet case is specifically about.
  const setup = (walletId: string | undefined) =>
    renderHook(() => useSecretReveal({ walletId, reveal }));

  it('reveals once the background accepts the password', async () => {
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));

    await waitFor(() => expect(result.current.isRevealed).toBe(true));
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith('correct horse battery');
    expect(result.current.submissionError).toBe('');
  });

  it('does not reveal, or even try, without a wallet', async () => {
    const { result } = setup(undefined);
    await act(() => result.current.formAction(form('correct horse battery')));

    expect(result.current.submissionError).toBe('Invalid wallet.');
    expect(reveal).not.toHaveBeenCalled();
    expect(result.current.isRevealed).toBe(false);
  });

  it('rejects a short password without asking the background', async () => {
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('short')));

    expect(result.current.submissionError).toMatch(/at least \d+ characters/);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('requires a password', async () => {
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form()));

    expect(result.current.submissionError).toBe('Password is required.');
    expect(reveal).not.toHaveBeenCalled();
  });

  // The secret must stay unreachable on every failing path, including the one
  // where the reveal itself blows up rather than reporting a wrong password.
  it('does not reveal when the password is wrong', async () => {
    reveal.mockResolvedValue(false);
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));

    expect(result.current.submissionError).toBe('Incorrect password.');
    expect(result.current.isRevealed).toBe(false);
  });

  it('stays unrevealed and shows the thrown message when the reveal fails', async () => {
    reveal.mockRejectedValue(new Error('Unable to retrieve recovery phrase.'));
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));

    expect(result.current.submissionError).toBe('Unable to retrieve recovery phrase.');
    expect(result.current.isRevealed).toBe(false);
  });

  it('clears a previous error on the next attempt', async () => {
    reveal.mockResolvedValueOnce(false);
    const { result } = setup('wallet-1');
    await act(() => result.current.formAction(form('correct horse battery')));
    expect(result.current.submissionError).toBe('Incorrect password.');

    await act(() => result.current.formAction(form('correct horse battery')));
    await waitFor(() => expect(result.current.isRevealed).toBe(true));
    expect(result.current.submissionError).toBe('');
  });
});
