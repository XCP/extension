import { act, render } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { HeaderProvider, useHeader } from '@/contexts/header-context';

/**
 * The wiring lives in app-providers so header-context stays free of wallet-context (which imports
 * webext-bridge and cannot load under jsdom). That means the effect is reproduced here rather than
 * imported: this pins the behaviour — a lock empties the caches — not the import graph.
 */
function ClearOnLock({ locked }: { locked: boolean }) {
  const { clearAllCaches } = useHeader();
  useEffect(() => {
    if (locked) clearAllCaches();
  }, [locked, clearAllCaches]);
  return null;
}

const BALANCE = {
  asset: 'XCP',
  quantity: 100,
  quantity_normalized: '1.00000000',
  asset_info: { asset_longname: null, description: '', issuer: '', divisible: true, locked: false },
} as any;

function Harness({ onCaches }: { onCaches: (n: number) => void }) {
  const { cacheBalances, subheadings } = useHeader();
  const [locked, setLocked] = useState(false);

  useEffect(() => { cacheBalances([BALANCE]); }, [cacheBalances]);
  useEffect(() => { onCaches(Object.keys(subheadings.balances).length); }, [subheadings, onCaches]);

  return (
    <>
      <ClearOnLock locked={locked} />
      <button type="button" onClick={() => setLocked(true)}>lock</button>
    </>
  );
}

describe('locking the keychain', () => {
  it('empties the header caches', async () => {
    const counts: number[] = [];
    const { getByText } = render(
      <HeaderProvider>
        <Harness onCaches={(n) => counts.push(n)} />
      </HeaderProvider>
    );

    // Balances are cached while unlocked.
    expect(counts.at(-1)).toBe(1);

    await act(async () => { getByText('lock').click(); });

    // ...and gone once locked. Holdings must not survive an explicit lock in memory.
    expect(counts.at(-1)).toBe(0);
  });

  it('clearAllCaches empties every cache, not just balances', () => {
    let api: ReturnType<typeof useHeader> | undefined;
    function Probe() {
      api = useHeader();
      return null;
    }
    render(<HeaderProvider><Probe /></HeaderProvider>);

    act(() => {
      api!.cacheBalances([BALANCE]);
      api!.setAddressHeader('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'Wallet 1');
      api!.cacheOwnedAssets([{
        asset: 'MYTOKEN', asset_longname: null, supply_normalized: '1', description: '', locked: false,
      }]);
    });

    expect(Object.keys(api!.subheadings.balances)).toHaveLength(1);
    expect(Object.keys(api!.subheadings.addresses)).toHaveLength(1);
    expect(Object.keys(api!.subheadings.ownedAssets)).toHaveLength(1);

    act(() => { api!.clearAllCaches(); });

    expect(Object.keys(api!.subheadings.balances)).toHaveLength(0);
    expect(Object.keys(api!.subheadings.addresses)).toHaveLength(0);
    expect(Object.keys(api!.subheadings.ownedAssets)).toHaveLength(0);
  });
});
