import { useEffect, useRef, memo } from 'react';
import { generateQR } from '@/utils/qr-code';
import logo from '@/assets/qr-code.png';

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

    // Generate QR code matrix with specified error correction level
    const matrix = generateQR(text, errorCorrectionLevel);
    const matrixSize = matrix.length;
    const totalSize = matrixSize + margin * 2;
    // Use the requested size directly for the canvas
    const actualSize = size;

    // Set canvas size
    canvas.width = actualSize;
    canvas.height = actualSize;

    // Clear canvas
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, actualSize, actualSize);

    // Draw QR code - use floating point to fill exact size
    ctx.fillStyle = darkColor;
    const exactCellSize = actualSize / totalSize;
    for (let row = 0; row < matrixSize; row++) {
      for (let col = 0; col < matrixSize; col++) {
        if (matrix[row][col]) {
          const x = (col + margin) * exactCellSize;
          const y = (row + margin) * exactCellSize;
          ctx.fillRect(x, y, exactCellSize, exactCellSize);
        }
      }
    }

    // Draw logo if provided
    if (logo?.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const cellSizeForLogo = exactCellSize; // Capture for closure

      img.onload = () => {
        const logoSize = logo.width || actualSize * 0.15; // Reduced from 0.2 to 0.15
        const logoHeight = logo.height || logoSize;
        const logoX = (actualSize - logoSize) / 2;
        const logoY = (actualSize - logoHeight) / 2;

        // Create circular white background for logo
        const padding = cellSizeForLogo * 1.5; // Reduced padding from 2 to 1.5
        const bgCenterX = logoX + logoSize / 2;
        const bgCenterY = logoY + logoHeight / 2;
        const bgRadius = (Math.max(logoSize, logoHeight) / 2) + padding;

        // Draw circular background
        ctx.fillStyle = lightColor;
        ctx.beginPath();
        ctx.arc(bgCenterX, bgCenterY, bgRadius, 0, Math.PI * 2);
        ctx.fill();

        // Create circular clipping path for logo
        ctx.save();
        ctx.beginPath();
        const logoRadius = Math.min(logoSize, logoHeight) / 2;
        ctx.arc(bgCenterX, bgCenterY, logoRadius, 0, Math.PI * 2);
        ctx.clip();

        // Draw logo with circular clipping
        ctx.drawImage(img, logoX, logoY, logoSize, logoHeight);
        ctx.restore();
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
      role="img"
      aria-label={`QR code for ${text}`}
      data-text={text}
      data-width={size.toString()}
      data-logo-src={logo?.src}
      data-logo-width={logo?.width?.toString()}
    />
  );
});

QRCanvas.displayName = 'QRCanvas';

interface QRCodeProps {
  /**
   * The text/data to encode in the QR code
   */
  text: string;
  /**
   * Optional width of the QR code in pixels
   * @default 286
   */
  width?: number;
  /**
   * Optional logo configuration. If not provided, uses default app logo
   */
  logo?: {
    src: string;
    width?: number;
  };
  /**
   * Optional className for the container
   */
  className?: string;
  /**
   * Optional aria-label for accessibility
   */
  ariaLabel?: string;
}

export const QRCode = memo(({
  text,
  width = 286,
  logo: customLogo,
  className = '',
  ariaLabel,
}: QRCodeProps) => {
  const logoConfig = customLogo || {
    src: logo,
    width: 50 // Reduced from 60 to better fit smaller logo area
  };

  return (
    <div className={`bg-white p-4 rounded-lg shadow-md ${className}`} aria-label={ariaLabel}>
      <QRCanvas
        text={text}
        size={width}
        errorCorrectionLevel="M"
        margin={2}
        logo={{
          src: logoConfig.src,
          width: logoConfig.width,
        }}
      />
    </div>
  );
});

QRCode.displayName = 'QRCode';