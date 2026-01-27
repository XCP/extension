import { useState, useCallback, useMemo, memo } from 'react';

/**
 * Props for the AssetIcon component.
 */
interface AssetIconProps {
  /** The asset symbol/name */
  asset: string;
  /** Size of the icon */
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  /** Optional CSS classes */
  className?: string;
  /** Whether to show rounded corners */
  rounded?: boolean;
  /** Whether to lazy load the image */
  lazy?: boolean;
  /** Custom fallback color scheme */
  fallbackColor?: 'gray' | 'blue' | 'green' | 'purple';
}

/**
 * Size mappings for predefined sizes
 */
const SIZES = {
  sm: 24,  // 6 * 4
  md: 32,  // 8 * 4
  lg: 40,  // 10 * 4
  xl: 48,  // 12 * 4
} as const;

const FALLBACK_COLORS = {
  gray: 'bg-gray-200 text-gray-500',
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
} as const;

/**
 * AssetIcon Component - Optimized for React 19
 * 
 * Improvements:
 * - Fixed dynamic Tailwind classes (using style prop instead)
 * - Memoized calculations to prevent recalculation
 * - Better image loading with useCallback
 * - Improved fallback rendering
 * - Added color schemes for fallbacks
 * - Better TypeScript types
 * 
 * @example
 * ```tsx
 * // With predefined size
 * <AssetIcon asset="XCP" size="lg" />
 * 
 * // With custom size in pixels
 * <AssetIcon asset="PEPECASH" size={64} rounded />
 * 
 * // With custom fallback color
 * <AssetIcon asset="RARE" fallbackColor="blue" />
 * ```
 */
export const AssetIcon = memo<AssetIconProps>(({ 
  asset, 
  size = 'lg', 
  className = '', 
  rounded = true,
  lazy = true,
  fallbackColor = 'gray'
}) => {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  
  // Calculate size in pixels
  const sizeInPixels = useMemo(() => 
    typeof size === 'number' ? size : SIZES[size],
    [size]
  );
  
  // Generate size styles (using style prop instead of dynamic classes)
  const sizeStyle = useMemo(() => ({
    width: `${sizeInPixels}px`,
    height: `${sizeInPixels}px`,
  }), [sizeInPixels]);
  
  // Generate fallback text
  const fallbackText = useMemo(() => 
    asset.slice(0, 3).toUpperCase(),
    [asset]
  );
  
  // Memoize event handlers
  const handleImageLoad = useCallback(() => {
    setImageState('loaded');
  }, []);
  
  const handleImageError = useCallback(() => {
    setImageState('error');
  }, []);
  
  // Determine border radius class
  const radiusClass = rounded ? 'rounded-full' : 'rounded';
  
  // Determine if we should show fallback
  const showFallback = imageState === 'loading' || imageState === 'error';
  
  return (
    <div 
      className={`relative inline-block ${className}`}
      style={sizeStyle}
      role="img"
      aria-label={`${asset} icon`}
    >
      {/* Fallback/placeholder */}
      {showFallback && (
        <div 
          className={`absolute inset-0 flex items-center justify-center font-semibold ${FALLBACK_COLORS[fallbackColor]} ${radiusClass}`}
          style={{ fontSize: `${sizeInPixels / 3}px` }}
        >
          {fallbackText}
        </div>
      )}
      
      {/* Actual image */}
      <img
        src={`https://app.xcp.io/img/icon/${asset}`}
        alt=""
        className={`absolute inset-0 object-cover transition-opacity duration-200 ${radiusClass} ${
          imageState === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
        style={sizeStyle}
        onLoad={handleImageLoad}
        onError={handleImageError}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
      />
    </div>
  );
});

AssetIcon.displayName = 'AssetIcon';

/**
 * AssetIconSkeleton Component
 * 
 * A skeleton loader for AssetIcon, useful for loading states
 */
export const AssetIconSkeleton = memo<{ 
  size?: AssetIconProps['size']; 
  rounded?: boolean;
  className?: string;
}>(({ size = 'lg', rounded = true, className = '' }) => {
  const sizeInPixels = typeof size === 'number' ? size : SIZES[size];
  const sizeStyle = {
    width: `${sizeInPixels}px`,
    height: `${sizeInPixels}px`,
  };
  const radiusClass = rounded ? 'rounded-full' : 'rounded';
  
  return (
    <div 
      className={`bg-gray-200 animate-pulse ${radiusClass} ${className}`}
      style={sizeStyle}
      aria-label="Loading asset icon"
    />
  );
});

AssetIconSkeleton.displayName = 'AssetIconSkeleton';

/**
 * AssetIconWithFallback Component
 * 
 * A variant that always shows a fallback SVG instead of loading from xcp.io.
 * Useful for performance-critical situations or offline support.
 * 
 * @param props - The component props (subset of AssetIconProps)
 * @returns A React element representing the asset icon with SVG fallback
 */
export const AssetIconWithFallback = memo<{ 
  asset: string;
  size?: AssetIconProps['size']; 
  className?: string;
}>(({ asset, size = 'lg', className = '' }) => {
  const sizeInPixels = typeof size === 'number' ? size : SIZES[size];
  const fallbackText = asset.slice(0, 3).toUpperCase();
  
  return (
    <div 
      className={`inline-flex items-center justify-center bg-gray-200 text-gray-500 rounded-full ${className}`}
      style={{ 
        width: `${sizeInPixels}px`, 
        height: `${sizeInPixels}px`,
        fontSize: `${sizeInPixels / 3}px`
      }}
      aria-label={`${asset} icon`}
    >
      {fallbackText}
    </div>
  );
});

AssetIconWithFallback.displayName = 'AssetIconWithFallback';