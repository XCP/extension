import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { FeeRateInput } from './fee-rate-input';

// The real useFeeRates, with only the network call mocked: rates arrive after
// the first render, as they do every time the form remounts (Back from review).
vi.mock('@/core/bitcoin/feeRate', () => ({
  getFeeRates: vi.fn(),
}));

import { getFeeRates } from '@/core/bitcoin/feeRate';

const rates = { fastestFee: 12, halfHourFee: 8, hourFee: 5 };

describe('FeeRateInput with fee rates arriving after mount', () => {
  beforeEach(() => {
    vi.mocked(getFeeRates).mockReset();
    vi.mocked(getFeeRates).mockImplementation(async () => rates);
  });

  it('keeps a custom initial fee rate instead of switching to the fastest preset', async () => {
    const onFeeRateChange = vi.fn();
    render(<FeeRateInput initialValue={3} onFeeRateChange={onFeeRateChange} />);

    const field = await screen.findByRole('textbox');
    await waitFor(() => expect(onFeeRateChange).toHaveBeenCalled());

    expect(field).toHaveValue('3');
    expect(onFeeRateChange).not.toHaveBeenCalledWith(12);
    expect(onFeeRateChange).toHaveBeenLastCalledWith(3);
  });

  it('restores a preset initial fee rate', async () => {
    const onFeeRateChange = vi.fn();
    const { container } = render(<FeeRateInput initialValue={8} onFeeRateChange={onFeeRateChange} />);

    const button = await screen.findByRole('button');
    await waitFor(() => expect(onFeeRateChange).toHaveBeenCalled());

    expect(button).toHaveTextContent('30 Min');
    expect(container.querySelector('input[name="sat_per_vbyte"]')).toHaveValue('8');
    expect(onFeeRateChange).toHaveBeenLastCalledWith(8);
  });

  it('defaults to the fastest preset without an initial fee rate', async () => {
    const onFeeRateChange = vi.fn();
    const { container } = render(<FeeRateInput initialValue={null} onFeeRateChange={onFeeRateChange} />);

    await screen.findByRole('button');
    await waitFor(() => expect(onFeeRateChange).toHaveBeenCalled());

    expect(container.querySelector('input[name="sat_per_vbyte"]')).toHaveValue('12');
    expect(onFeeRateChange).toHaveBeenLastCalledWith(12);
  });
});
