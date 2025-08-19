import React from 'react';

/**
 * Props for the Skeleton component.
 */
interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

/**
 * A reusable skeleton loader component for showing loading states.
 * Prevents layout shift by maintaining the same dimensions as the content it replaces.
 */
export const Skeleton = ({ 
  className = '', 
  width, 
  height,
  rounded = 'md'
}: SkeletonProps) => {
  const roundedClasses = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full'
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div 
      className={`animate-pulse bg-gray-200 ${roundedClasses[rounded]} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
};

/**
 * Props for the HeaderSkeleton component.
 */
interface HeaderSkeletonProps {
  className?: string;
  variant?: 'balance' | 'asset' | 'address';
  showSubtitle?: boolean;
  imageRounded?: 'md' | 'full';
}

/**
 * A flexible skeleton loader for various header components.
 * Prevents CLS when header data loads by maintaining consistent dimensions.
 * 
 * Variants:
 * - balance: For BalanceHeader (icon + name + available balance)
 * - asset: For AssetHeader (icon + name + supply)
 * - address: For AddressHeader (logo + wallet name + address)
 */
export const HeaderSkeleton = ({ 
  className = '',
  variant = 'balance',
  showSubtitle = true,
  imageRounded = variant === 'address' ? 'full' : 'md'
}: HeaderSkeletonProps) => {
  // Different width configurations for each variant
  const titleWidth = variant === 'address' ? 180 : 120;
  const subtitleWidth = variant === 'address' ? 140 : 160;
  
  return (
    <div className={`flex items-center ${className}`}>
      {/* Image/Icon skeleton - 48x48 (w-12 h-12) */}
      <Skeleton 
        width={48} 
        height={48} 
        rounded={imageRounded}
        className="mr-4"
      />
      <div>
        {/* Title skeleton (asset name, address, etc.) */}
        <Skeleton 
          width={titleWidth} 
          height={24} 
          className={showSubtitle ? "mb-1" : ""}
        />
        {/* Subtitle skeleton (balance, supply, wallet name) */}
        {showSubtitle && (
          <Skeleton 
            width={subtitleWidth} 
            height={16}
          />
        )}
      </div>
    </div>
  );
};

