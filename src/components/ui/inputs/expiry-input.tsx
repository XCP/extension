import { useState, type ReactElement } from 'react';
import {
  Field,
  Label,
  Description,
  Input,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { Button } from '@/components/ui/button';

const PRESET_OPTIONS = [
  { id: 'none', name: 'No expiration', days: 0 },
  { id: '30d', name: '30 days', days: 30 },
] as const;

type PresetId = typeof PRESET_OPTIONS[number]['id'];
type OptionId = PresetId | 'custom';

interface ExpiryInputProps {
  showHelpText?: boolean;
  disabled?: boolean;
  onChange?: (expiresAt: string) => void;
}

function daysToIso(days: number): string {
  if (days <= 0) return 'none';
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * ExpiryInput provides listing expiry selection with presets and custom days input.
 * Follows the same Listbox + custom input pattern as FeeRateInput.
 */
export function ExpiryInput({
  showHelpText = false,
  disabled = false,
  onChange,
}: ExpiryInputProps): ReactElement {
  const [selectedOption, setSelectedOption] = useState<OptionId>('none');
  const [customDays, setCustomDays] = useState('');

  const allOptions = [
    ...PRESET_OPTIONS,
    { id: 'custom' as const, name: 'Custom', days: 0 },
  ];

  const handlePresetSelect = (opt: typeof allOptions[number]) => {
    setSelectedOption(opt.id);
    if (opt.id !== 'custom') {
      onChange?.(daysToIso(opt.days));
    }
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d.]/g, '');
    setCustomDays(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      onChange?.(daysToIso(num));
    }
  };

  const handleCustomBlur = () => {
    const num = parseFloat(customDays);
    if (isNaN(num) || num <= 0) {
      setCustomDays('');
      setSelectedOption('none');
      onChange?.('none');
    }
  };

  const handleEscClick = () => {
    setSelectedOption('none');
    setCustomDays('');
    onChange?.('none');
  };

  return (
    <Field>
      <Label className="block text-sm font-medium text-gray-700">
        Listing Expires <span className="text-red-500">*</span>
      </Label>
      <div className="mt-1">
        {selectedOption === 'custom' ? (
          <div className="relative">
            <Input
              type="text"
              inputMode="decimal"
              value={customDays}
              onChange={handleCustomChange}
              onBlur={handleCustomBlur}
              disabled={disabled}
              placeholder="Number of days"
              className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 pr-16 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <Button variant="input" onClick={handleEscClick} disabled={disabled} aria-label="Reset to preset">
              Esc
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Listbox
              value={allOptions.find(o => o.id === selectedOption) || allOptions[0]}
              onChange={handlePresetSelect}
              disabled={disabled}
            >
              <ListboxButton className="w-full p-2.5 text-left rounded-md border border-gray-200 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer">
                {({ value }) => <span>{value?.name}</span>}
              </ListboxButton>
              <ListboxOptions className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                {allOptions.map((opt) => (
                  <ListboxOption
                    key={opt.id}
                    value={opt}
                    className={({ focus }) =>
                      `p-2.5 cursor-pointer select-none ${focus ? 'bg-blue-500 text-white' : 'text-gray-900'}`
                    }
                  >
                    {({ selected }) => (
                      <span className={selected ? 'font-medium' : ''}>{opt.name}</span>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </Listbox>
          </div>
        )}
      </div>
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          How long the listing stays active. Off-chain, cancel anytime.
        </Description>
      )}
    </Field>
  );
}
