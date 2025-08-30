import React from 'react';
import { Button as HeadlessButton } from '@headlessui/react';
import { FaYoutube } from 'react-icons/fa';

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

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  color = 'blue',
  variant = 'solid',
  children,
  className,
  fullWidth = false,
  disabled = false,
  href,
  ...props
}, ref) => {
  // If youtube variant, render as YouTube CTA
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
  const baseStyles = (() => {
    switch (variant) {
      case 'menu':
        return 'p-1 flex';
      case 'menu-item':
        return 'flex px-4 py-2 text-sm';
      case 'input':
        return 'flex items-center justify-center w-11 px-2 py-1 absolute right-1 top-1/2 -translate-y-1/2 text-sm';
      case 'icon':
        return 'py-2 px-3 flex items-center justify-center';
      case 'header':
        return 'h-[32px] py-1 px-3 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2';
      default:
        return 'font-bold py-3 px-4 rounded transition duration-300 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2';
    }
  })();
  
  const getStyles = ({ active }: { active: boolean }) => {
    if (variant === 'menu' || variant === 'icon' || variant === 'input') {
      return 'bg-transparent text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer';
    }
    
    if (variant === 'menu-item') {
      return 'bg-transparent text-gray-800 hover:bg-gray-50 focus:outline-none cursor-pointer';
    }
    
    if (variant === 'header') {
      return `text-blue-500 hover:bg-blue-50 font-normal ${disabled ? 'opacity-50 cursor-progress' : 'cursor-pointer'}`;
    }

    if (variant === 'transparent') {
      return `bg-transparent hover:bg-gray-50 focus:ring-gray-200 ${disabled ? 'opacity-50 cursor-progress' : 'cursor-pointer'}`;
    }

    const styles = {
      blue: `bg-blue-500 ${active ? 'bg-blue-700' : 'hover:bg-blue-600'} text-white focus:ring-blue-500`,
      gray: `bg-gray-200 ${active ? 'bg-gray-400' : 'hover:bg-gray-300'} text-gray-800 focus:ring-gray-400`,
      green: `bg-green-500 ${active ? 'bg-green-700' : 'hover:bg-green-600'} text-white focus:ring-green-500`,
      red: `bg-red-500 ${active ? 'bg-red-700' : 'hover:bg-red-600'} text-white focus:ring-red-500`,
    };
    return `${styles[color]} ${disabled ? 'opacity-50 cursor-progress' : 'cursor-pointer'}`;
  };

  const widthStyles = fullWidth ? 'w-full' : '';

  return (
    <HeadlessButton
      as="button"
      ref={ref}
      disabled={disabled}
      className={({ active }) => `
        ${baseStyles} 
        ${getStyles({ active })} 
        ${widthStyles}
        ${className || ''}
      `}
      {...props}
    >
      {children}
    </HeadlessButton>
  );
});

Button.displayName = 'Button';
