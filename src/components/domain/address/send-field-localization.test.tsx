import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DestinationInput } from '@/components/ui/inputs/destination-input';
import { MemoInput } from '@/components/ui/inputs/memo-input';
import { configureLocale, t } from '@/i18n';
import { DestinationsInput } from './destinations-input';

const lookups = vi.hoisted(() => ({
  single: vi.fn(),
  multiple: vi.fn(),
  state: () => ({ isLookingUp: false, error: undefined }),
}));
vi.mock('@/hooks/useAssetOwnerLookup', () => ({
  useAssetOwnerLookup: () => ({
    isLookingUp: false, result: null, error: null, performLookup: lookups.single,
  }),
  useMultiAssetOwnerLookup: () => ({
    performLookup: lookups.multiple, getLookupState: lookups.state,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  configureLocale({ language: 'en', numberLocale: 'de-DE' });
});
afterEach(() => {
  cleanup();
  configureLocale({ language: 'en', numberLocale: 'auto' });
});

describe('send field labels follow language without changing intent', () => {
  it.each([1, 2])('updates the %s-destination heading and preserves addresses and invalid memo bytes', count => {
    const destinations = Array.from({ length: count }, (_, index) => ({
      id: index + 1, address: `unfinished-address-${index + 1}`,
    }));
    const changed = vi.fn();
    const validated = vi.fn();
    const memoChanged = vi.fn();
    const memoValidated = vi.fn();
    render(<>
      <DestinationsInput destinations={destinations} onChange={changed}
        onValidationChange={validated} required={false} />
      <MemoInput onChange={memoChanged} onValidationChange={memoValidated} />
    </>);
    const fields = screen.getAllByRole('textbox');
    const memo = fields[count]!;
    const draft = ` ${'測'.repeat(12)} `;
    fireEvent.change(memo, { target: { value: draft } });
    expect(memo).toHaveClass('border-red-500');
    expect(memoChanged).toHaveBeenLastCalledWith(draft);
    expect(memoValidated).toHaveBeenLastCalledWith(false);
    changed.mockClear(); validated.mockClear(); memoChanged.mockClear(); memoValidated.mockClear();

    for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK', 'en']) {
      act(() => configureLocale({ language, numberLocale: 'de-DE' }));
      expect(screen.getByText(t(count > 1 ? 'common_destinations' : 'common_destination'))).toBeInTheDocument();
      expect(screen.getByText(t('common_memo'))).toBeInTheDocument();
      const currentFields = screen.getAllByRole('textbox');
      currentFields.forEach((field, index) => { expect(field).toBe(fields[index]); });
      destinations.forEach((destination, index) => { expect(currentFields[index]).toHaveValue(destination.address); });
      expect(memo).toHaveValue(draft);
      expect(memo).toHaveClass('border-red-500');
      expect(changed).not.toHaveBeenCalled();
      expect(validated).not.toHaveBeenCalled();
      expect(memoChanged).not.toHaveBeenCalled();
      expect(memoValidated).not.toHaveBeenCalled();
    }
    expect(lookups.multiple).not.toHaveBeenCalled();
  });

  it('translates the shared single-address default and preserves explicit caller labels', () => {
    const changed = vi.fn();
    render(<>
      <DestinationInput value="unfinished-address" onChange={changed} required={false} />
      <DestinationInput value="another-address" onChange={changed} label="Specific recipient" required={false} />
    </>);
    const fields = screen.getAllByRole('textbox');
    expect(lookups.single).toHaveBeenCalledTimes(2);
    for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK', 'en']) {
      act(() => configureLocale({ language, numberLocale: 'de-DE' }));
      expect(screen.getByRole('textbox', { name: t('common_destination') })).toBe(fields[0]);
      expect(screen.getByRole('textbox', { name: 'Specific recipient' })).toBe(fields[1]);
      expect(fields[0]).toHaveValue('unfinished-address');
      expect(fields[1]).toHaveValue('another-address');
    }
    expect(changed).not.toHaveBeenCalled();
    expect(lookups.single).toHaveBeenCalledTimes(2);
  });
});
