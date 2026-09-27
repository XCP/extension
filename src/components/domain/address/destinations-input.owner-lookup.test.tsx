import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { AssetOwnerLookupResult } from '@/core/validation/assetOwner';
import type { Destination } from '@/core/validation/destinations';
import { DestinationsInput } from './destinations-input';

// Only the network read is faked; `shouldTriggerAssetLookup` and the hook's debounce are real.
vi.mock('@/core/validation/assetOwner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/validation/assetOwner')>()),
  lookupAssetOwner: vi.fn(),
}));

import { lookupAssetOwner } from '@/core/validation/assetOwner';

const OWNER = 'bc1qowner0000000000000000000000000000000';
const ADDRESS_X = 'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const ADDRESS_Y = 'bc1qyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';

/** A lookup the test answers when it chooses, so edits can land while it is in flight. */
function deferLookup() {
  let answer!: (result: AssetOwnerLookupResult) => void;
  vi.mocked(lookupAssetOwner).mockImplementationOnce(
    () => new Promise<AssetOwnerLookupResult>((resolve) => { answer = resolve; })
  );
  return (ownerAddress: string) => answer({ isValid: true, ownerAddress, assetName: 'PEPECASH' });
}

/** The form's real shape: the parent owns the array and hands each render the latest one. */
function Harness({ initial }: { initial: Destination[] }) {
  const [destinations, setDestinations] = useState(initial);
  return (
    <DestinationsInput
      destinations={destinations}
      onChange={setDestinations}
      asset="XCP"
      enableMPMA
    />
  );
}

const rows = () => screen.getAllByRole('textbox') as HTMLInputElement[];

describe('DestinationsInput asset-owner lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills the row with the owner of the typed asset', async () => {
    const answer = deferLookup();
    render(<Harness initial={[{ id: 1, address: '' }]} />);

    fireEvent.change(rows()[0]!, { target: { value: 'PEPECASH.xcp' } });
    await waitFor(() => expect(lookupAssetOwner).toHaveBeenCalledWith('PEPECASH.xcp'), { timeout: 2000 });

    await act(async () => { answer(OWNER); });

    await waitFor(() => expect(rows()[0]).toHaveValue(OWNER));
  });

  it('keeps an edit made to another row while the lookup was in flight', async () => {
    const answer = deferLookup();
    render(<Harness initial={[{ id: 1, address: '' }, { id: 2, address: ADDRESS_X }]} />);

    fireEvent.change(rows()[0]!, { target: { value: 'PEPECASH.xcp' } });
    await waitFor(() => expect(lookupAssetOwner).toHaveBeenCalled(), { timeout: 2000 });

    fireEvent.change(rows()[1]!, { target: { value: ADDRESS_Y } });
    expect(rows()[1]).toHaveValue(ADDRESS_Y);

    await act(async () => { answer(OWNER); });

    await waitFor(() => expect(rows()[0]).toHaveValue(OWNER));
    expect(rows()[1]).toHaveValue(ADDRESS_Y);
  });

  it('keeps an address typed into a previously empty row while the lookup was in flight', async () => {
    const answer = deferLookup();
    render(<Harness initial={[{ id: 1, address: '' }, { id: 2, address: '' }]} />);

    fireEvent.change(rows()[0]!, { target: { value: 'PEPECASH.xcp' } });
    await waitFor(() => expect(lookupAssetOwner).toHaveBeenCalled(), { timeout: 2000 });

    fireEvent.change(rows()[1]!, { target: { value: ADDRESS_Y } });

    await act(async () => { answer(OWNER); });

    await waitFor(() => expect(rows()[0]).toHaveValue(OWNER));
    expect(rows()[1]).toHaveValue(ADDRESS_Y);
  });

  it('leaves the row alone if it no longer holds the looked-up name', async () => {
    const answer = deferLookup();
    render(<Harness initial={[{ id: 1, address: '' }]} />);

    fireEvent.change(rows()[0]!, { target: { value: 'PEPECASH.xcp' } });
    await waitFor(() => expect(lookupAssetOwner).toHaveBeenCalled(), { timeout: 2000 });

    // A multi-line paste rewrites the row without going through the typed-lookup path.
    fireEvent.paste(rows()[0]!, {
      clipboardData: { getData: () => `${ADDRESS_X}\n${ADDRESS_Y}` },
    });
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toHaveValue(ADDRESS_X);

    await act(async () => { answer(OWNER); });

    expect(rows()[0]).toHaveValue(ADDRESS_X);
    expect(rows()[1]).toHaveValue(ADDRESS_Y);
  });

  it('does not bring back a row removed while the lookup was in flight', async () => {
    const answer = deferLookup();
    render(<Harness initial={[{ id: 1, address: '' }, { id: 2, address: ADDRESS_X }]} />);

    fireEvent.change(rows()[0]!, { target: { value: 'PEPECASH.xcp' } });
    await waitFor(() => expect(lookupAssetOwner).toHaveBeenCalled(), { timeout: 2000 });

    fireEvent.click(screen.getByRole('button', { name: /remove destination 2/i }));
    expect(rows()).toHaveLength(1);

    await act(async () => { answer(OWNER); });

    await waitFor(() => expect(rows()[0]).toHaveValue(OWNER));
    expect(rows()).toHaveLength(1);
  });
});
