import { type MouseEvent, type ReactElement, type ReactNode, useCallback } from 'react';
import logo from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import type { HeaderButtonProps, HeaderProps } from '@/contexts/header-context';

import { t } from '@/i18n';
/**
 * Header component renders a navigation bar with optional left and right buttons.
 */
export function Header({
  useLogoTitle = false,
  title,
  leftButton,
  rightButton,
  rightAccessory,
  onBack,
}: HeaderProps): ReactElement {
  const hasControls = Boolean(onBack || leftButton || rightButton || rightAccessory);

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
        title={label}
        className={useLogoTitle ? 'min-w-0 max-w-full' : undefined}
        disabled={disabled}
      >
        {icon && (
          <span className={label ? 'mr-1' : ''} aria-hidden="true">
            {icon}
          </span>
        )}
        {useLogoTitle && label ? <span className="truncate">{label}</span> : label}
      </Button>
    );
  }, [useLogoTitle]);

  return (
    <header className={`grid min-h-16 shrink-0 ${useLogoTitle && hasControls ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'grid-cols-4'} items-center bg-white px-4 py-3 shadow-md`}>
      {/* Left Section */}
      {hasControls && <div className="col-span-1 min-w-0 flex justify-start">
        {onBack ? (
          <Button
            onClick={handleLeftClick}
            variant="header"
            aria-label={t('layout_header_go_back')}
            disabled={leftButton?.disabled}
          >
            <span className="mr-1" aria-hidden="true">
              ←
            </span>
            
            {t('common_back')}
          </Button>
        ) : (
          renderButton(leftButton)
        )}
      </div>}

      {/* Center Section */}
      <div className={`${hasControls ? useLogoTitle ? 'col-span-1' : 'col-span-2' : 'col-span-4'} flex justify-center items-center min-w-0`}>
        {useLogoTitle ? (
          <img src={typeof logo === 'string' ? logo : (logo as any).src || logo} alt={t('layout_header_logo')} className="h-8" />
        ) : typeof title === 'string' ? (
          <h1 className="text-lg leading-snug font-bold text-center line-clamp-2 break-words" title={title}>{title}</h1>
        ) : (
          title
        )}
      </div>

      {/* Right Section */}
      {hasControls && <div className="col-span-1 flex items-center justify-end gap-1">
        {rightAccessory}
        {renderButton(rightButton)}
      </div>}
    </header>
  );
}
