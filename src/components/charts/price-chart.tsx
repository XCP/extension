import { useEffect, useRef, useState, useCallback, memo } from 'react';
import type { PricePoint } from '@/utils/blockchain/bitcoin/price';
import type { ReactElement } from 'react';

interface PriceChartProps {
  data: PricePoint[];
  width?: number;
  height?: number;
  lineColor?: string;
  loading?: boolean;
  className?: string;
  currencySymbol?: string;
}

/**
 * Canvas-based line chart for displaying price history with hover interaction.
 * Lightweight alternative to chart libraries.
 */
export const PriceChart = memo(({
  data,
  width = 300,
  height = 200,
  lineColor = '#f97316',
  loading = false,
  className = '',
  currencySymbol = '$',
}: PriceChartProps): ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Padding constants
  const padding = { top: 10, right: 10, bottom: 10, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate scale functions (memoized based on data)
  const getScaleFns = useCallback(() => {
    if (data.length < 2) return null;

    const prices = data.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    return {
      minPrice,
      maxPrice,
      priceRange,
      scaleX: (i: number) => padding.left + (i / (data.length - 1)) * chartWidth,
      scaleY: (price: number) =>
        padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight,
    };
  }, [data, chartWidth, chartHeight, padding.left, padding.top]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Need at least 2 points to draw
    if (data.length < 2) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', width / 2, height / 2);
      return;
    }

    const scaleFns = getScaleFns();
    if (!scaleFns) return;

    const { scaleX, scaleY } = scaleFns;

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, hexToRgba(lineColor, 0.3));
    gradient.addColorStop(1, hexToRgba(lineColor, 0));

    ctx.beginPath();
    ctx.moveTo(scaleX(0), scaleY(data[0].price));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(scaleX(i), scaleY(data[i].price));
    }
    ctx.lineTo(scaleX(data.length - 1), height - padding.bottom);
    ctx.lineTo(scaleX(0), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(scaleX(0), scaleY(data[0].price));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(scaleX(i), scaleY(data[i].price));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw hover indicator if hovering
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length) {
      const x = scaleX(hoverIndex);
      const y = scaleY(data[hoverIndex].price);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot at data point
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

  }, [data, width, height, lineColor, loading, hoverIndex, getScaleFns, padding.bottom, padding.top]);

  // Handle mouse move to find closest data point
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Find closest data point based on x position
    const normalizedX = (x - padding.left) / chartWidth;
    const index = Math.round(normalizedX * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(data.length - 1, index));

    setHoverIndex(clampedIndex);
  }, [data.length, chartWidth, padding.left]);

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  // Format price for display
  const formatPrice = (price: number) => {
    return `${currencySymbol}${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  // Format time for display
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div
        className={`animate-pulse bg-gray-100 rounded ${className}`}
        style={{ width, height }}
      />
    );
  }

  const hoveredPoint = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className={`relative ${className}`}>
      {/* Hover tooltip */}
      {hoveredPoint && (
        <div className="absolute top-0 left-0 right-0 flex justify-between items-center text-xs px-1">
          <span className="text-gray-500">{formatTime(hoveredPoint.timestamp)}</span>
          <span className="font-medium text-gray-900">{formatPrice(hoveredPoint.price)}</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ width, height, display: 'block', cursor: data.length >= 2 ? 'crosshair' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        data-testid="price-chart"
      />
    </div>
  );
});

PriceChart.displayName = 'PriceChart';

/**
 * Convert hex color to rgba
 */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 0, 0, ${alpha})`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
