import { useEffect, useRef, memo } from 'react';
import { generateQRMatrix } from '@/utils/qr-code';

interface QRCanvasProps {
  /**
   * The text/data to encode in the QR code
   */
  text: string;
  /**
   * Size of the QR code in pixels
   * @default 200
   */
  size?: number;
  /**
   * Error correction level
   * @default 'M'
   */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /**
   * QR code foreground color
   * @default '#000000'
   */
  darkColor?: string;
  /**
   * QR code background color
   * @default '#FFFFFF'
   */
  lightColor?: string;
  /**
   * Margin around QR code in modules
   * @default 2
   */
  margin?: number;
  /**
   * Optional logo to overlay on QR code
   */
  logo?: {
    src: string;
    width?: number;
    height?: number;
  };
  /**
   * Optional className for the canvas element
   */
  className?: string;
}

export const QRCanvas = memo(({
  text,
  size = 200,
  errorCorrectionLevel = 'M',
  darkColor = '#000000',
  lightColor = '#FFFFFF',
  margin = 2,
  logo,
  className = '',
}: QRCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Generate QR code matrix
    const matrix = generateQRMatrix(text, errorCorrectionLevel);
    const matrixSize = matrix.length;
    const totalSize = matrixSize + margin * 2;
    const cellSize = Math.floor(size / totalSize);
    const actualSize = cellSize * totalSize;

    // Set canvas size
    canvas.width = actualSize;
    canvas.height = actualSize;

    // Clear canvas
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, actualSize, actualSize);

    // Draw QR code
    ctx.fillStyle = darkColor;
    for (let row = 0; row < matrixSize; row++) {
      for (let col = 0; col < matrixSize; col++) {
        if (matrix[row][col]) {
          const x = (col + margin) * cellSize;
          const y = (row + margin) * cellSize;
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }

    // Draw logo if provided
    if (logo?.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const logoSize = logo.width || actualSize * 0.2;
        const logoHeight = logo.height || logoSize;
        const logoX = (actualSize - logoSize) / 2;
        const logoY = (actualSize - logoHeight) / 2;

        // Create white background for logo
        const padding = cellSize * 2;
        ctx.fillStyle = lightColor;
        ctx.fillRect(
          logoX - padding,
          logoY - padding,
          logoSize + padding * 2,
          logoHeight + padding * 2
        );

        // Draw logo
        ctx.drawImage(img, logoX, logoY, logoSize, logoHeight);
      };

      img.onerror = () => {
        console.warn('Failed to load QR code logo:', logo.src);
      };

      img.src = logo.src;
      logoRef.current = img;
    }

    // Cleanup
    return () => {
      if (logoRef.current) {
        logoRef.current.onload = null;
        logoRef.current.onerror = null;
        logoRef.current = null;
      }
    };
  }, [text, size, errorCorrectionLevel, darkColor, lightColor, margin, logo]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
      data-testid="qr-canvas"
      data-text={text}
      data-width={size.toString()}
      data-logo-src={logo?.src}
      data-logo-width={logo?.width?.toString()}
    />
  );
});