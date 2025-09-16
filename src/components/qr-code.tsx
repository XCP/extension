import { useEffect, useRef, memo } from 'react';
import { generateQRMatrix } from '@/utils/qr-code';
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
        const logoSize = logo.width || actualSize * 0.15; // Reduced from 0.2 to 0.15
        const logoHeight = logo.height || logoSize;
        const logoX = (actualSize - logoSize) / 2;
        const logoY = (actualSize - logoHeight) / 2;

        // Create rounded white background for logo
        const padding = cellSize * 1.5; // Reduced padding from 2 to 1.5
        const bgX = logoX - padding;
        const bgY = logoY - padding;
        const bgWidth = logoSize + padding * 2;
        const bgHeight = logoHeight + padding * 2;
        const cornerRadius = padding; // Rounded corners

        // Draw rounded rectangle background
        ctx.fillStyle = lightColor;
        ctx.beginPath();
        ctx.moveTo(bgX + cornerRadius, bgY);
        ctx.lineTo(bgX + bgWidth - cornerRadius, bgY);
        ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + cornerRadius);
        ctx.lineTo(bgX + bgWidth, bgY + bgHeight - cornerRadius);
        ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - cornerRadius, bgY + bgHeight);
        ctx.lineTo(bgX + cornerRadius, bgY + bgHeight);
        ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - cornerRadius);
        ctx.lineTo(bgX, bgY + cornerRadius);
        ctx.quadraticCurveTo(bgX, bgY, bgX + cornerRadius, bgY);
        ctx.closePath();
        ctx.fill();

        // Create clipping path for rounded logo
        ctx.save();
        ctx.beginPath();
        const logoRadius = logoSize * 0.1; // Rounded corners for logo itself
        ctx.moveTo(logoX + logoRadius, logoY);
        ctx.lineTo(logoX + logoSize - logoRadius, logoY);
        ctx.quadraticCurveTo(logoX + logoSize, logoY, logoX + logoSize, logoY + logoRadius);
        ctx.lineTo(logoX + logoSize, logoY + logoHeight - logoRadius);
        ctx.quadraticCurveTo(logoX + logoSize, logoY + logoHeight, logoX + logoSize - logoRadius, logoY + logoHeight);
        ctx.lineTo(logoX + logoRadius, logoY + logoHeight);
        ctx.quadraticCurveTo(logoX, logoY + logoHeight, logoX, logoY + logoHeight - logoRadius);
        ctx.lineTo(logoX, logoY + logoRadius);
        ctx.quadraticCurveTo(logoX, logoY, logoX + logoRadius, logoY);
        ctx.closePath();
        ctx.clip();

        // Draw logo with clipping
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
      data-testid="qr-canvas"
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