import React from 'react';
import { useQRCode } from 'next-qrcode';
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

export const QRCode = React.memo(({
  text,
  width = 270,
  logo: customLogo,
  className = '',
  ariaLabel,
}: QRCodeProps) => {
  const { Canvas } = useQRCode();

  const logoConfig = customLogo || {
    src: logo,
    width: 60
  };

  return (
    <div className={`bg-white p-4 rounded-lg shadow-md ${className}`} aria-label={ariaLabel}>
      <Canvas
        text={text}
        options={{
          errorCorrectionLevel: 'M',
          margin: 2,
          scale: 4,
          width,
          color: {
            dark: '#000000FF',
            light: '#FFFFFFFF',
          },
        }}
        logo={{
          src: logoConfig.src,
          options: {
            width: logoConfig.width,
            x: undefined,
            y: undefined,
          },
        }}
      />
    </div>
  );
});

QRCode.displayName = 'QRCode'; 