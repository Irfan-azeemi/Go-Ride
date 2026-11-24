import React from 'react';

interface GoRideLogoProps {
  variant?: 'default' | 'light';
  size?: 'sm' | 'md' | 'lg';
}

export const GoRideLogo: React.FC<GoRideLogoProps> = ({
  variant = 'default',
  size = 'md',
}) => {
  const iconDim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const textColor = variant === 'light' ? 'text-white' : 'text-[#102E65]';
  const accentColor = variant === 'light' ? 'text-blue-300' : 'text-[#155EEF]';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <div
        className={`${iconDim} rounded-xl bg-[#155EEF] flex items-center justify-center shadow-sm border border-[#102E65]/15 shrink-0`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-6 h-6"
        >
          {/* Stylized Car + Bike Mobility Emblem */}
          <path
            d="M6 19.5L9.2 12.6C9.7 11.6 10.7 11 11.8 11H21.2C22.4 11 23.4 11.7 23.9 12.8L26.5 18.5"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.5 20.5H27.5C28.6 20.5 29.5 21.4 29.5 22.5V24.5C29.5 25.1 29.1 25.5 28.5 25.5H26.5"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="10" cy="25.5" r="2.7" fill="#102E65" stroke="white" strokeWidth="2" />
          <circle cx="23.5" cy="25.5" r="2.7" fill="#102E65" stroke="white" strokeWidth="2" />
          {/* Speed/Bike Handle Accent */}
          <path
            d="M27.5 14L31.5 11.5M28.5 17H32"
            stroke="#93C5FD"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className={`font-display font-bold tracking-tight ${textSize} ${textColor}`}>
        Go<span className={accentColor}>Ride</span>
      </span>
    </div>
  );
};
