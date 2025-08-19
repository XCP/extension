import { useState, useEffect, useMemo } from 'react';
import { getFeeRates, FeeRates } from '@/utils/blockchain/bitcoin';

export type FeeRateOption = 'fast' | 'medium' | 'slow';

export interface FeeOption {
  id: FeeRateOption;
  name: string;
  value: number;
}

export function useFeeRates(autoFetch = true) {
  const [feeRates, setFeeRates] = useState<FeeRates | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (autoFetch) {
      getFeeRates()
        .then((rates) => {
          setFeeRates(rates);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError('Unable to fetch fee rates.');
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [autoFetch]);

  const uniquePresetOptions = useMemo<FeeOption[]>(() => {
    if (!feeRates) return [];
    const presets: FeeOption[] = [];
    const included = new Set<number>();
    const tryAdd = (option: FeeOption) => {
      if (!included.has(option.value)) {
        presets.push(option);
        included.add(option.value);
      }
    };
    tryAdd({ id: 'fast', name: 'Fastest', value: feeRates.fastestFee });
    tryAdd({ id: 'medium', name: '30 Min', value: feeRates.halfHourFee });
    tryAdd({ id: 'slow', name: '1 Hour', value: feeRates.hourFee });
    return presets;
  }, [feeRates]);

  return { feeRates, loading, error, uniquePresetOptions };
}
