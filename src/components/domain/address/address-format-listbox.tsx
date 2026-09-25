import { type KeyboardEvent, type ReactElement, type ReactNode, useRef, useState } from 'react';
import type { AddressFormat } from '@/core/bitcoin/address';

interface AddressFormatListboxProps {
  formats: AddressFormat[];
  selectedFormat: AddressFormat | null;
  /** Called with the option the user chose by Enter, Space or a click. */
  onCommit: (format: AddressFormat) => void;
  /** Accessible name of the list. */
  label: string;
  busy?: boolean;
  /** Offered for reading only, e.g. a hardware wallet whose format is fixed at connection. */
  disabled?: boolean;
  className?: string;
  optionClassName: (state: { selected: boolean; disabled: boolean }) => string;
  children: (format: AddressFormat, state: { selected: boolean }) => ReactNode;
}

/**
 * The address-type choice as a listbox, not a radio group.
 *
 * Switching re-derives the wallet's addresses, so moving through the options must not commit
 * anything — with a radio group, arrowing past an option switched the wallet to it. Arrow keys,
 * Home and End only move focus; Enter, Space or a click commits the focused option. Settings →
 * Address type and the home header shortcut both render through this, over the same
 * `useAddressFormatSwitch` state.
 */
export function AddressFormatListbox({
  formats,
  selectedFormat,
  onCommit,
  label,
  busy = false,
  disabled = false,
  className,
  optionClassName,
  children,
}: AddressFormatListboxProps): ReactElement {
  const optionRefs = useRef(new Map<AddressFormat, HTMLDivElement>());
  const [focusedFormat, setFocusedFormat] = useState<AddressFormat | null>(
    () => selectedFormat ?? formats[0] ?? null
  );
  // The roving tab stop must name an option that exists, or the list cannot be reached by Tab.
  const tabStop = focusedFormat && formats.includes(focusedFormat) ? focusedFormat : selectedFormat ?? formats[0];

  const commit = (format: AddressFormat) => {
    if (!disabled) onCommit(format);
  };

  const moveFocus = (format: AddressFormat | undefined) => {
    if (!format) return;
    setFocusedFormat(format);
    optionRefs.current.get(format)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, format: AddressFormat) => {
    const current = formats.indexOf(format);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(formats[Math.min(current + 1, formats.length - 1)]);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(formats[Math.max(current - 1, 0)]);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus(formats[0]);
        break;
      case 'End':
        event.preventDefault();
        moveFocus(formats.at(-1));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(format);
        break;
    }
  };

  return (
    <div
      role="listbox"
      aria-label={label}
      aria-busy={busy}
      aria-disabled={disabled || undefined}
      className={className}
    >
      {formats.map((format) => {
        const selected = format === selectedFormat;
        return (
          <div
            key={format}
            ref={(element) => {
              if (element) optionRefs.current.set(format, element);
              else optionRefs.current.delete(format);
            }}
            role="option"
            aria-selected={selected}
            aria-disabled={disabled || undefined}
            tabIndex={format === tabStop ? 0 : -1}
            onClick={() => commit(format)}
            onKeyDown={(event) => handleKeyDown(event, format)}
            onFocus={() => setFocusedFormat(format)}
            className={optionClassName({ selected, disabled })}
          >
            {children(format, { selected })}
          </div>
        );
      })}
    </div>
  );
}
