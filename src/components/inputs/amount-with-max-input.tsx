import axios from 'axios';
import React, { useState, ChangeEvent } from 'react';
import { Field, Input, Label, Description } from '@headlessui/react';
import { Button } from '@/components/button';
import { isValidBase58Address } from '@/utils/blockchain/bitcoin';
import { composeSend } from '@/utils/blockchain/counterparty';

interface AmountWithMaxInputProps {
  asset: string;
  availableBalance: string;
  value: string;
  onChange: (value: string) => void;
 // Always required
  setError: (message: string | null) => void;
  shouldShowHelpText: boolean;
  sourceAddress: { address: string } | null;
  maxAmount: string;
  label: string;
  name: string;
  description?: string;
  disabled?: boolean;
  destinationCount?: number;
  destination?: string;
  memo?: string;
  disableMaxButton?: boolean;
  onMaxClick?: () => void;
}

export function AmountWithMaxInput({
  asset,
  availableBalance,
  value,
  onChange,
  feeRateSatPerVByte,
  setError,
  shouldShowHelpText,
  sourceAddress,
  maxAmount,
  label,
  name,
  description,
  disabled = false,
  destinationCount = 1,
  destination,
  memo = '',
  disableMaxButton = false,
  onMaxClick,
}: AmountWithMaxInputProps) {
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setError(null);
  };

  const handleMaxButtonClick = async () => {
    if (!sourceAddress || disabled) return;
    const sourceAddr = sourceAddress.address;

    if (asset !== 'BTC') {
      const maxNum = Number(maxAmount);
      if (!isNaN(maxNum)) {
        const perDestination = (maxNum / destinationCount).toFixed(8);
        onChange(perDestination);
      }
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const estimationDestination =
        destination && isValidBase58Address(destination)
          ? destination
          : sourceAddr;
      const availableSats = Math.floor(Number(availableBalance) * 1e8);
      if (availableSats <= 0) {
        throw new Error('No available balance.');
      }

      let candidate: number | undefined;

      try {
        const composeResult = await composeSend({
          sourceAddress: sourceAddr,
          destination: estimationDestination,
          asset: 'BTC',
          quantity: availableSats.toString(),
          memo,
          sat_per_vbyte: feeRateSatPerVByte, // Always provided
        });
        const fee = composeResult.result.btc_fee;
        candidate = availableSats - fee;
      } catch (e: any) {
        const errorMsg = e.response?.data?.error || e.message || '';
        const regex = /Insufficient funds for the target amount:\s*(\d+)\s*<\s*(\d+)/;
        const match = regex.exec(errorMsg);
        if (match) {
          const balanceParsed = parseInt(match[1], 10);
          const targetNeeded = parseInt(match[2], 10);
          candidate = balanceParsed - (targetNeeded - balanceParsed);
        } else {
          throw e;
        }
      }

      if (candidate === undefined || candidate <= 0) {
        throw new Error('Insufficient balance to cover transaction fee.');
      }

      const dustLimit = 546;
      const amountPerDestination = Math.floor(candidate / destinationCount);
      if (amountPerDestination < dustLimit) {
        throw new Error('Amount per destination after fee is below dust limit.');
      }
      const finalAmount = (amountPerDestination / 1e8).toFixed(8);
      onChange(finalAmount);
    } catch (err: any) {
      console.error('Failed to calculate max amount:', err);
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to estimate max amount.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMaxClick = () => {
    if (disableMaxButton) {
      onMaxClick?.();
      return;
    }
    handleMaxButtonClick();
  };

  return (
    <Field>
      <Label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label}
        <span className="text-red-500">*</span>
      </Label>
      <div className="mt-1 relative rounded-md shadow-sm">
        <Input
          type="text"
          name={name}
          id={name}
          value={value}
          onChange={handleInputChange}
          autoComplete="off"
          className="mt-1 block w-full p-2 rounded-md border bg-gray-50 pr-16 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          placeholder="0.00000000"
          disabled={disabled}
        />
        <Button
          variant="input"
          onClick={handleMaxClick}
          disabled={loading || disabled || disableMaxButton}
          aria-label={loading ? "Calculating maximum amount..." : "Use maximum available amount"}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 px-2 py-1 text-sm"
        >
          {loading ? "..." : "Max"}
        </Button>
      </div>
      {shouldShowHelpText && (
        <Description id={`${name}-description`} className="mt-2 text-sm text-gray-500">
          {description || `Enter the amount of ${asset} you want to send${destinationCount > 1 ? ' (per destination)' : ''}.`}
        </Description>
      )}
    </Field>
  );
}
