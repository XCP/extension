import { forwardRef, useMemo } from 'react';
import { Button as HeadlessButton } from '@headlessui/react';
import { FaYoutube } from '@/components/icons';

export type ButtonColor = 'blue' | 'gray' | 'green' | 'red';
export type ButtonVariant = 'solid' | 'transparent' | 'icon' | 'header' | 'menu' | 'menu-item' | 'input' | 'youtube';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: ButtonColor;
  variant?: ButtonVariant;
  children: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  href?: string; // For youtube variant
}

/**
 * Button Component - Optimized for React 19
 * 
 * Improvements:
 * - Memoized style calculations to prevent recalculation
 * - Simplified variant logic with lookup tables
 * - Better TypeScript inference
 * - Reduced conditional complexity
 * - More consistent class naming
 */

// Style configurations extracted as constants for better performance
const BASE_STYLES: Record<ButtonVariant, string> = {
  solid: 'font-bold py-3 px-4 rounded transition duration-300 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2',
  transparent: 'font-bold py-3 px-4 rounded transition duration-300 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2',
  menu: 'p-1 flex',
  'menu-item': 'flex px-4 py-2 text-sm',
  input: 'flex items-center justify-center w-11 px-2 py-1 absolute right-1 top-1/2 -translate-y-1/2 text-sm',
  icon: 'py-2 px-3 flex items-center justify-center',
  header: 'h-[32px] py-1 px-3 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2',
  youtube: '', // Handled separately
};

const COLOR_STYLES: Record<ButtonColor, { base: string; active: string }> = {
  blue: {
    base: 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500',
    active: 'bg-blue-700 text-white focus:ring-blue-500'
  },
  gray: {
    base: 'bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-gray-400',
    active: 'bg-gray-400 text-gray-800 focus:ring-gray-400'
  },
  green: {
    base: 'bg-green-500 hover:bg-green-600 text-white focus:ring-green-500',
    active: 'bg-green-700 text-white focus:ring-green-500'
  },
  red: {
    base: 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500',
    active: 'bg-red-700 text-white focus:ring-red-500'
  },
};

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  solid: '', // Uses color styles
  transparent: 'bg-transparent hover:bg-gray-50 focus:ring-gray-200',
  menu: 'bg-transparent text-gray-500 hover:text-gray-700 focus:outline-none',
  'menu-item': 'bg-transparent text-gray-800 hover:bg-gray-50 focus:outline-none',
  input: 'bg-transparent text-gray-500 hover:text-gray-700 focus:outline-none',
  icon: 'bg-transparent text-gray-500 hover:text-gray-700 focus:outline-none',
  header: 'text-blue-500 hover:bg-blue-50 font-normal',
  youtube: '', // Handled separately
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  color = 'blue',
  variant = 'solid',
  children,
  className = '',
  fullWidth = false,
  disabled = false,
  href,
  ...props
}, ref) => {
  // Memoize the class computation to avoid recalculation on every render
  // MUST be called before any early returns to follow Rules of Hooks
  const computedClassName = useMemo(() => {
    const getColorStyle = (active: boolean) => {
      if (variant === 'solid') {
        const colorConfig = COLOR_STYLES[color];
        return active ? colorConfig.active : colorConfig.base;
      }
      return '';
    };

    return (active: boolean) => {
      const baseStyle = BASE_STYLES[variant];
      const variantStyle = VARIANT_STYLES[variant];
      const colorStyle = getColorStyle(active);
      const widthStyle = fullWidth ? 'w-full' : '';
      const disabledStyle = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

      return `${baseStyle} ${variantStyle} ${colorStyle} ${widthStyle} ${disabledStyle} ${className}`.trim();
    };
  }, [variant, color, fullWidth, disabled, className]);

  // YouTube variant is a special case - render as link
  if (variant === 'youtube') {
    const youtubeHref = href || 'https://youtube.com/';
    return (
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <a
          href={youtubeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 text-gray-700 hover:text-red-600 transition-colors"
          aria-label={`${children} - Opens in new tab`}
        >
          <FaYoutube className="text-2xl text-red-600" aria-hidden="true" />
          <span className="font-medium">{children}</span>
        </a>
      </div>
    );
  }

  return (
    <HeadlessButton
      as="button"
      ref={ref}
      disabled={disabled}
      className={({ active }) => computedClassName(active)}
      {...props}
    >
      {children}
    </HeadlessButton>
  );
});

Button.displayName = 'Button';