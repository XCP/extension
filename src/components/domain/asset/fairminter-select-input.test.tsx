import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { type FairminterDetails, fetchAssetFairminter, fetchOpenFairminters } from '@/core/counterparty/api';
import { FairminterSelectInput } from './fairminter-select-input';

vi.mock('@/core/counterparty/api', () => ({ fetchAssetFairminter: vi.fn(), fetchOpenFairminters: vi.fn() }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: { counterpartyApiBase: 'node' } }) }));
vi.mock('@/hooks/useBlockHeight', () => ({ useBlockHeight: () => ({ blockHeight: 950000 }) }));

const rows = Array.from({ length: 125 }, (_, i) => ({
  asset: `PAGE${i}`, tx_hash: String(i), status: 'open', price: 0, quantity_by_price: 1,
  price_normalized: '0', quantity_by_price_normalized: '1', description: `Sale ${i}`,
})) as FairminterDetails[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchAssetFairminter).mockResolvedValue(null);
  vi.mocked(fetchOpenFairminters).mockImplementation(async ({ offset = 0, limit = 20 } = {}) => ({
    result: rows.slice(offset, offset + limit), result_count: rows.length,
  }));
});

it('loads 20 at a time and resolves a restored selection beyond page one directly', async () => {
  vi.mocked(fetchAssetFairminter).mockResolvedValue(rows[124]!);
  const onChange = vi.fn();
  render(<FairminterSelectInput selectedAsset="PAGE124" onChange={onChange} label="Fairminter" />);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('PAGE124', rows[124]));
  expect(fetchOpenFairminters).toHaveBeenCalledTimes(1);
  expect(fetchOpenFairminters).toHaveBeenCalledWith({ offset: 0, limit: 20 });
  fireEvent.click(screen.getByRole('button', { name: 'Load more fairminters' }));
  await waitFor(() => expect(fetchOpenFairminters).toHaveBeenCalledWith({ offset: 20, limit: 20 }));
});

it('continues through pages that the currency filter hides', async () => {
  vi.mocked(fetchOpenFairminters).mockImplementation(async ({ offset = 0, limit = 20 } = {}) => ({
    result: rows.slice(offset, offset + limit).map((row, i) => ({ ...row, price_normalized: offset + i === 124 ? '1' : '0' })) as FairminterDetails[],
    result_count: rows.length,
  }));
  render(<FairminterSelectInput selectedAsset="" onChange={vi.fn()} label="Fairminter" currencyFilter="XCP" />);
  await waitFor(() => expect(fetchOpenFairminters).toHaveBeenCalledTimes(7));
  expect(screen.queryByText('No matching fairminters.')).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
  await waitFor(() => expect(screen.getByRole('option')).toHaveTextContent('PAGE124'));
});

it('shows later-page failure, retains earlier options, and supports retry', async () => {
  vi.mocked(fetchOpenFairminters).mockResolvedValueOnce({ result: rows.slice(0, 20), result_count: 125 })
    .mockRejectedValueOnce(new Error('offline'));
  render(<FairminterSelectInput selectedAsset="" onChange={vi.fn()} label="Fairminter" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more fairminters' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load more'));
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(20));
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
