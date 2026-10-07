import React from 'react';
import pamdaLogo from '../../../logo pamda.png';

interface PamdaLogoProps {
  className?: string;
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const PamdaLogo: React.FC<PamdaLogoProps> = ({
  className = '',
  variant = 'dark',
  size = 'md',
  showSubtitle = true,
}) => {
  const width = {
    sm: 120,
    md: 160,
    lg: 220,
    xl: 280,
  }[size];

  return (
    <div
      className={`inline-flex overflow-hidden ${showSubtitle ? 'items-center' : 'items-start'} ${className}`}
      style={{ width, height: showSubtitle ? undefined : width * 0.36 }}
    >
      <img
        src={pamdaLogo}
        alt="Pamda Cases"
        width={width}
        className="block h-auto max-w-none select-none"
        style={{ filter: variant === 'light' ? 'brightness(0) invert(1)' : undefined }}
      />
    </div>
  );
};
