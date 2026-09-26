import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from '@/contexts/settings-context';

/** How long the slippage input must sit still before its value is saved as the default. */
export const SLIPPAGE_SAVE_DELAY_MS = 800;

/**
 * Save a slippage edit as the user's default pool slippage, once the user stops editing.
 *
 * Settings live inside the encrypted keychain, so every save re-encrypts it and makes every open
 * wallet UI reload. Typing "0.75" used to save three times. Edits are now saved after a pause (and
 * on leaving the screen), and a value equal to the stored default is not saved at all.
 *
 * Callers pass only values they would have saved before: the validity rules stay theirs.
 */
export function useSlippageDefaultSaver(): (next: string) => void {
  const { settings, updateSettings } = useSettings();
  const saved = useRef<string | undefined>(settings?.defaultPoolSlippage);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    saved.current = settings?.defaultPoolSlippage;
  }, [settings?.defaultPoolSlippage]);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = pending.current;
    pending.current = null;
    if (next === null || next === saved.current) return;
    const previous = saved.current;
    saved.current = next;
    Promise.resolve().then(() => updateSettings({ defaultPoolSlippage: next })).catch((error: unknown) => {
      if (saved.current === next) saved.current = previous;
      console.error('Failed to save default slippage:', error);
    });
  }, [updateSettings]);

  // Leaving the screen inside the pause still saves the last edit.
  useEffect(() => save, [save]);

  return useCallback((next: string) => {
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SLIPPAGE_SAVE_DELAY_MS);
  }, [save]);
}
