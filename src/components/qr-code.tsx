import { memo } from 'react';
import { QRCanvas } from './qr-canvas';
import logo from '@/assets/qr-code.png';

interface QRCodeProps {
  /**
   * The text/data to encode in the QR code
   */
  text: string;
  /**
   * Optional width of the QR code in pixels
   * @default 270
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
  width = 270,
  logo: customLogo,
  className = '',
  ariaLabel,
}: QRCodeProps) => {
  const logoConfig = customLogo || {
    src: logo,
    width: 60
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