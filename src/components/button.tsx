import React from 'react';
import { Button as HeadlessButton } from '@headlessui/react';

export type ButtonColor = 'blue' | 'gray' | 'green' | 'red';
export type ButtonVariant = 'solid' | 'transparent' | 'icon' | 'header' | 'menu' | 'menu-item' | 'input';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: ButtonColor;
  variant?: ButtonVariant;
  children: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  color = 'blue',
  variant = 'solid',
  children,
  className,
  fullWidth = false,
  disabled = false,
  ...props
}, ref) => {
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
