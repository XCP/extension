import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import dieselLogo from '@/assets/diesel.jpg';
import { BalanceHeader } from '@/components/domain/balance/balance-header';
import { FiInfo } from '@/components/icons';
import { SettingSwitch } from '@/components/ui/inputs/setting-switch';
import type { ActionSection } from '@/components/ui/lists/action-list';
import { ActionList } from '@/components/ui/lists/action-list';
import { Spinner } from '@/components/ui/spinner';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import {
  type DieselAddressBalance,
  dieselBaseUnitsToDisplay,
  fetchDieselBalance,
} from '@/core/alkanes/api';
import type { TokenBalance } from '@/core/counterparty/api';
import {
  asDisplayUnits,
  isGreaterThan,
  isLessThanOrEqualTo,
  multiply,
  roundUp,
  toFiniteNumber,
} from '@/core/numeric';

export default function DieselBalancePage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const { settings, updateSettings } = useSettings();
  const [balance, setBalance] = useState<DieselAddressBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feeRateInput, setFeeRateInput] = useState(String(settings.dieselMintMaxFeeRate));
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const shouldShowHelpText = isHelpTextOverride ? !settings.showHelpText : settings.showHelpText;

  useEffect(() => {
    setFeeRateInput(String(settings.dieselMintMaxFeeRate));
  }, [settings.dieselMintMaxFeeRate]);

  const load = useCallback(async () => {
    if (!activeAddress) return;
    setLoading(true);
    setError(null);
    try {
      setBalance(await fetchDieselBalance(activeAddress.address));
    } catch (cause) {
      console.error('Failed to load DIESEL balance:', cause);
      setError('The Alkanes indexer could not be reached.');
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setHeaderProps({
      title: 'DIESEL',
      onBack: () => navigate('/index'),
      rightButton: {
        icon: <FiInfo className="size-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((previous) => !previous),
        ariaLabel: 'Toggle help text',
      },
    });
    return () => setHeaderProps(null);
  }, [navigate, setHeaderProps]);

  if (loading && !balance) return <Spinner message="Loading DIESEL…" />;
  const protectionStatus = settings.protectAlkanesUtxos
    ? 'Your DIESEL remains protected.'
    : 'Alkanes protection is off. Ordinary transactions can burn your tokens.';
  if (!balance) return <div className="p-4 text-center text-gray-600">{error ?? 'No balance data'} {protectionStatus}</div>;

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
  const dieselUtxoSats = balance.utxos.reduce((sum, utxo) => sum + (utxo.value ?? 0), 0);
  const displayedFeeRate = toFiniteNumber(feeRateInput);
  const validDisplayedFeeRate = displayedFeeRate !== undefined && isGreaterThan(displayedFeeRate, 0)
    ? displayedFeeRate
    : settings.dieselMintMaxFeeRate;
  const optimizedMintCost = roundUp(multiply(26, validDisplayedFeeRate)).toFixed(0);
  const saveFeeRate = () => {
    const value = toFiniteNumber(feeRateInput);
    if (
      value === undefined
      || !isGreaterThan(value, 0)
      || !isLessThanOrEqualTo(value, 1_000)
    ) {
      setFeeRateInput(String(settings.dieselMintMaxFeeRate));
      return;
    }
    void updateSettings({ dieselMintMaxFeeRate: value });
  };
  const sections: ActionSection[] = [{
    items: [{
      id: 'send',
      title: 'Send',
      description: 'Send DIESEL while returning any remainder to protected wallet storage',
      onClick: () => navigate('/diesel/send'),
    }],
  }];

  return (
    <section className="p-4 space-y-6" aria-labelledby="diesel-balance-title">
      <BalanceHeader balance={token} className="mt-1 mb-5" iconSrc={dieselLogo} />
      <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-medium text-gray-900">Mining policy</h2>
        <SettingSwitch
          label="Mine on eligible transactions"
          description="Adds a mint only to supported wallet transactions at or below your fee-rate limit. Turning this off does not make existing DIESEL spendable as ordinary BTC."
          checked={settings.enableDieselMinting}
          onChange={(checked) => void updateSettings(checked
            ? { enableDieselMinting: true, protectAlkanesUtxos: true }
            : { enableDieselMinting: false })}
          showHelpText={shouldShowHelpText}
        />
        <div className="space-y-2">
          <label htmlFor="diesel-max-fee-rate" className="block text-sm font-semibold">
            Maximum fee rate
          </label>
          <div className="flex items-center gap-2">
            <input
              id="diesel-max-fee-rate"
              type="text"
              inputMode="decimal"
              value={feeRateInput}
              disabled={!settings.enableDieselMinting}
              onChange={(event) => setFeeRateInput(event.target.value)}
              onBlur={saveFeeRate}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              aria-label="Maximum DIESEL mining fee rate"
              className="min-w-0 flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
            <span className="text-sm text-gray-500">sat/vB</span>
          </div>
          {shouldShowHelpText && <p className="text-xs text-gray-500">
            Above this rate or with an unsupported transaction, the original transaction proceeds
            without mining. At this limit, the +26-vB mint costs about {optimizedMintCost} sats.
          </p>}
          {shouldShowHelpText && <p className="text-xs text-amber-700">
            This limits cost; it does not guarantee profit. Profit-aware mining needs a verified
            recent reward estimate and an executable DIESEL-to-BTC exit quote.
          </p>}
        </div>
      </div>
      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h2 id="diesel-balance-title" className="text-sm font-medium text-gray-900">DIESEL storage</h2>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Status</span>
          <span className={settings.protectAlkanesUtxos ? 'text-gray-900' : 'text-amber-700'}>
            {settings.protectAlkanesUtxos ? 'Protected' : 'Protection off'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Reserved Bitcoin</span>
          <span className="text-gray-900">{dieselUtxoSats.toLocaleString()} sats</span>
        </div>
        {!settings.protectAlkanesUtxos && <p role="status" className="text-xs text-amber-700">
          Ordinary transactions can burn your tokens. Enable Alkanes protection in Advanced settings.
        </p>}
        {shouldShowHelpText && settings.protectAlkanesUtxos && <p className="text-xs text-gray-500">
          Your DIESEL is shown as one balance. Behind the scenes it is secured by Bitcoin outputs
          that the wallet excludes from ordinary BTC and Counterparty spending.
        </p>}
        {error && <p className="text-xs text-red-600">{error} {protectionStatus}</p>}
      </div>
      <ActionList sections={sections} />
    </section>
  );
}
