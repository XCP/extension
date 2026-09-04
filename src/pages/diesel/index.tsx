import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { BalanceHeader } from '@/components/domain/balance/balance-header';
import type { ActionSection } from '@/components/ui/lists/action-list';
import { ActionList } from '@/components/ui/lists/action-list';
import { Spinner } from '@/components/ui/spinner';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import {
  type DieselAddressBalance,
  dieselBaseUnitsToDisplay,
  fetchDieselBalance,
} from '@/core/alkanes/api';
import type { TokenBalance } from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';

export default function DieselBalancePage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const [balance, setBalance] = useState<DieselAddressBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeAddress) return;
    setLoading(true);
    setError(null);
    try {
      setBalance(await fetchDieselBalance(activeAddress.address));
    } catch (cause) {
      console.error('Failed to load DIESEL balance:', cause);
      setError('The Alkanes indexer could not be reached. Your carriers remain protected.');
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setHeaderProps({ title: 'DIESEL', onBack: () => navigate('/index') });
    return () => setHeaderProps(null);
  }, [navigate, setHeaderProps]);

  if (loading && !balance) return <Spinner message="Loading DIESEL…" />;
  if (!balance) return <div className="p-4 text-center text-gray-600">{error ?? 'No balance data'}</div>;

  const token: TokenBalance = {
    asset: 'DIESEL',
    quantity_normalized: asDisplayUnits(dieselBaseUnitsToDisplay(balance.baseUnits)),
    asset_info: {
      asset_longname: null,
      description: 'Alkanes DIESEL (2:0)',
      issuer: '',
      divisible: true,
      locked: false,
    },
  };
  const carrierSats = balance.carriers.reduce((sum, carrier) => sum + (carrier.value ?? 0), 0);
  const sections: ActionSection[] = [{
    items: [{
      id: 'send',
      title: 'Send',
      description: 'Send DIESEL while preserving any remainder in a wallet-owned carrier',
      onClick: () => navigate('/diesel/send'),
    }],
  }];

  return (
    <section className="p-4 space-y-6" aria-labelledby="diesel-balance-title">
      <BalanceHeader balance={token} className="mt-1 mb-5" />
      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h2 id="diesel-balance-title" className="text-sm font-medium text-gray-900">Alkanes carriers</h2>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Confirmed outputs</span>
          <span className="text-gray-900">{balance.carriers.length}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Carrier bitcoin</span>
          <span className="text-gray-900">{carrierSats.toLocaleString()} sats</span>
        </div>
        <p className="text-xs text-gray-500">
          DIESEL is held on Bitcoin outputs. The wallet excludes these outputs from ordinary BTC
          and Counterparty spending.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <ActionList sections={sections} />
    </section>
  );
}
