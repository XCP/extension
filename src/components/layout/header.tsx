import { type MouseEvent, type ReactElement, type ReactNode, useCallback } from 'react';
import logo from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import type { HeaderButtonProps, HeaderProps } from '@/contexts/header-context';

/**
 * Header component renders a navigation bar with optional left and right buttons.
 */
export function Header({
  useLogoTitle = false,
  title,
  leftButton,
  rightButton,
  onBack,
}: HeaderProps): ReactElement {

  /**
   * Handles the click event for the left/back button.
   */
  const handleLeftClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    // No event.preventDefault() since these are regular buttons
    if (onBack) {
      onBack();
    } else if (leftButton) {
      leftButton.onClick();
    }
  }, [onBack, leftButton]);

  /**
   * Renders a button based on the provided configuration.
   */
  const renderButton = useCallback((config?: HeaderButtonProps): ReactNode => {
    if (!config) return null;

    const { ariaLabel, label, icon, disabled } = config;

    return (
      <Button
        onClick={config.onClick}
        variant="header"
        aria-label={ariaLabel}
        disabled={disabled}
      >
        {icon && (
          <span className={label ? 'mr-1' : ''} aria-hidden="true">
            {icon}
          </span>
        )}
        {label}
      </Button>
    );
  }, []);

  return (
    <header className="grid h-16 shrink-0 grid-cols-4 items-center bg-white p-4 shadow-md">
      {/* Left Section */}
      <div className="col-span-1 flex justify-start">
        {onBack ? (
          <Button
            onClick={handleLeftClick}
            variant="header"
            aria-label="Go Back"
            disabled={leftButton?.disabled}
          >
            <span className="mr-1" aria-hidden="true">
              ←
            </span>
            Back
          </Button>
        ) : (
          renderButton(leftButton)
        )}
      </div>

      {/* Center Section */}
      <div className="col-span-2 flex justify-center items-center min-w-0">
        {useLogoTitle ? (
          <img src={typeof logo === 'string' ? logo : (logo as any).src || logo} alt="Logo" className="h-8" />
        ) : typeof title === 'string' ? (
          <h1 className="text-lg font-bold truncate">{title}</h1>
        ) : (
          title
        )}
      </div>

      {/* Right Section */}
      <div className="col-span-1 flex justify-end">
        {renderButton(rightButton)}
      </div>
    </header>
  );
}
