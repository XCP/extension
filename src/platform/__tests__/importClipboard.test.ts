import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearImportedKeyFromClipboard, hasImportClipboardAccess, requestImportClipboardAccess } from '../importClipboard';

const permissions = () => chrome.permissions as unknown as { contains: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> };
const key = '1'.repeat(64);
const readText = vi.fn();
const writeText = vi.fn();

describe('import clipboard cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions().contains.mockResolvedValue(true);
    readText.mockResolvedValue(key);
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
  });

  it('requests optional access explicitly', async () => {
    permissions().request.mockResolvedValue(true);
    expect(await requestImportClipboardAccess()).toBe(true);
    expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ['clipboardRead', 'clipboardWrite'] });
  });

  it('clears matching text, including surrounding whitespace', async () => {
    readText.mockResolvedValue('  ' + key + '\n');
    expect(await clearImportedKeyFromClipboard(key)).toBe('cleared');
    expect(writeText).toHaveBeenCalledWith('');
  });

  it.each(['other copied text', '', key + ' extra'])('preserves nonmatching clipboard text: %s', async text => {
    readText.mockResolvedValue(text);
    expect(await clearImportedKeyFromClipboard(key)).toBe('unchanged');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('never reads without permission or prompts during cleanup', async () => {
    permissions().contains.mockResolvedValue(false);
    expect(await clearImportedKeyFromClipboard(key)).toBe('unavailable');
    expect(readText).not.toHaveBeenCalled();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it('rejects an empty key without reading', async () => {
    expect(await clearImportedKeyFromClipboard(' ')).toBe('unavailable');
    expect(readText).not.toHaveBeenCalled();
  });

  it('handles revoked access', async () => {
    readText.mockRejectedValueOnce(new Error('Denied'));
    expect(await clearImportedKeyFromClipboard(key)).toBe('unavailable');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('handles write failure', async () => {
    writeText.mockRejectedValueOnce(new Error('Not focused'));
    expect(await clearImportedKeyFromClipboard(key)).toBe('unavailable');
  });

  it('handles permission API errors', async () => {
    permissions().contains.mockRejectedValueOnce(new Error('Unavailable'));
    permissions().request.mockRejectedValueOnce(new Error('Unavailable'));
    expect(await hasImportClipboardAccess()).toBe(false);
    expect(await requestImportClipboardAccess()).toBe(false);
  });
});
