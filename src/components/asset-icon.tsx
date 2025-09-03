import React, { useState } from 'react';

/**
 * Props for the AssetIcon component.
 */
interface AssetIconProps {
  /** The asset symbol/name */
  asset: string;
  /** Size of the icon (width and height) */
  size?: 'sm' | 'md' | 'lg' | number;
  /** Optional CSS classes */
  className?: string;
  /** Whether to show rounded corners */
  rounded?: boolean;
}

/**
 * Size mappings for predefined sizes
 */
const SIZES = {
  sm: 32,  // 8 * 4 (w-8 h-8)
  md: 40,  // 10 * 4 (w-10 h-10)
  lg: 48,  // 12 * 4 (w-12 h-12)
} as const;

/**
 * AssetIcon Component
 * 
 * A reusable component for displaying asset icons with fallback support.
 * Handles loading states and provides a text-based fallback for missing icons.
 * 
 * Features:
 * - Automatic image loading from xcp.io
 * - Fallback display for missing/failed images
 * - Configurable sizes
 * - Loading state management
 * 
 * @param props - The component props
 * @returns A React element representing the asset icon
 * 
 * @example
 * ```tsx
 * // With predefined size
 * <AssetIcon asset="XCP" size="lg" />
 * 
 * // With custom size
 * <AssetIcon asset="PEPECASH" size={64} rounded />
 * 
 * // With custom classes
 * <AssetIcon asset="RARE" className="border-2 border-blue-500" />
 * ```
 */
export function AssetIcon({ 
  asset, 
  size = 'lg', 
  className = '', 
  rounded = true 
}: AssetIconProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Determine actual size in pixels
  const sizeInPixels = typeof size === 'number' ? size : SIZES[size];
  const sizeClass = `w-${sizeInPixels / 4} h-${sizeInPixels / 4}`;
  
  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };
  
  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(true);
  };
  
  // Generate fallback text (first 3 characters of asset)
  const fallbackText = asset.slice(0, 3).toUpperCase();
  
  return (
    <div className={`relative ${sizeClass} ${className}`}>
      {/* Placeholder/fallback */}
      {(!imageLoaded || imageError) && (
        <div 
          className={`absolute inset-0 bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-semibold ${
            rounded ? 'rounded-full' : 'rounded'
          }`}
          aria-label={`${asset} icon placeholder`}
        >
          {fallbackText}
        </div>
      )}
      
      {/* Actual image */}
      <img
        src={`https://app.xcp.io/img/icon/${asset}`}
        alt={`${asset} icon`}
        className={`absolute inset-0 ${sizeClass} object-cover transition-opacity duration-200 ${
          imageLoaded && !imageError ? 'opacity-100' : 'opacity-0'
        } ${rounded ? 'rounded-full' : 'rounded'}`}
        onLoad={handleImageLoad}
        onError={handleImageError}
        loading="lazy"
      />
    </div>
  );
}

/**
 * AssetIconWithFallback Component
 * 
 * A variant that always shows a fallback SVG instead of loading from xcp.io.
 * Useful for performance-critical situations or offline support.
 * 
 * @param props - The component props (subset of AssetIconProps)
 * @returns A React element representing the asset icon with SVG fallback
 */
export function AssetIconWithFallback({ 
  asset, 
  size = 'lg', 
  className = '' 
}: Omit<AssetIconProps, 'rounded'>) {
  const sizeInPixels = typeof size === 'number' ? size : SIZES[size];
  
  return (
    <div 
      className={`w-${sizeInPixels / 4} h-${sizeInPixels / 4} ${className}`}
      dangerouslySetInnerHTML={{
        __html: `<svg xmlns='http://www.w3.org/2000/svg' width='${sizeInPixels}' height='${sizeInPixels}' viewBox='0 0 ${sizeInPixels} ${sizeInPixels}'><rect width='${sizeInPixels}' height='${sizeInPixels}' fill='#e5e7eb' rx='${sizeInPixels / 2}'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9ca3af' font-family='system-ui' font-size='${sizeInPixels / 3}'>${asset.slice(0, 3).toUpperCase()}</text></svg>`
      }}
      aria-label={`${asset} icon`}
    />
  );
}

export default AssetIcon;