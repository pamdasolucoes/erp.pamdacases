import React from 'react';

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
  const isLight = variant === 'light';
  const mainColor = isLight ? '#ffffff' : '#0a0a0a';

  const sizeDimensions = {
    sm: { width: 120, height: 52 },
    md: { width: 160, height: 70 },
    lg: { width: 220, height: 96 },
    xl: { width: 280, height: 122 },
  }[size];

  return (
    <div className={`inline-flex items-center ${className}`}>
      <svg
        viewBox="0 0 460 200"
        width={sizeDimensions.width}
        height={sizeDimensions.height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="select-none overflow-visible"
      >
        {/* PANDA HEAD ABOVE LETTER 'M' */}
        <g id="panda-mascot">
          {/* Left Ear */}
          <ellipse
            cx="205"
            cy="24"
            rx="16"
            ry="18"
            transform="rotate(-18 205 24)"
            fill={mainColor}
          />
          {/* Right Ear */}
          <ellipse
            cx="255"
            cy="24"
            rx="16"
            ry="18"
            transform="rotate(18 255 24)"
            fill={mainColor}
          />

          {/* Left Eye Patch */}
          <ellipse
            cx="213"
            cy="46"
            rx="11"
            ry="14"
            transform="rotate(-15 213 46)"
            fill={mainColor}
          />
          {/* Right Eye Patch */}
          <ellipse
            cx="247"
            cy="46"
            rx="11"
            ry="14"
            transform="rotate(15 247 46)"
            fill={mainColor}
          />

          {/* Eye Pupils (white sparkle) */}
          <circle cx="215" cy="44" r="2.5" fill={isLight ? '#0a0a0a' : '#ffffff'} />
          <circle cx="245" cy="44" r="2.5" fill={isLight ? '#0a0a0a' : '#ffffff'} />

          {/* Cute Nose and Mouth */}
          <ellipse cx="230" cy="59" rx="8" ry="5.5" fill={mainColor} />
          <path
            d="M 226 64 C 228 66, 230 66, 230 68 C 230 66, 232 66, 234 64"
            stroke={mainColor}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>

        {/* PAMDA TYPOGRAPHY (Rounded, chunky, organic style matching the uploaded logo) */}
        <g id="pamda-text" fill={mainColor}>
          {/* Letter P */}
          <path
            d="M 22 72 
               C 22 60, 48 56, 68 56 
               C 88 56, 96 66, 96 82 
               C 96 98, 86 106, 68 108 
               L 52 108 
               L 52 138 
               C 52 146, 22 146, 22 138 
               Z
               M 52 74 
               L 52 92 
               L 66 92 
               C 74 92, 78 87, 78 83 
               C 78 79, 74 74, 66 74 
               Z"
          />

          {/* Letter A */}
          <path
            d="M 112 138 
               C 112 146, 136 146, 138 136 
               L 142 120 
               L 162 120 
               L 166 136 
               C 168 146, 192 146, 192 138 
               L 164 64 
               C 160 56, 144 56, 140 64 
               Z
               M 146 104 
               L 152 78 
               L 158 104 
               Z"
          />

          {/* Letter M (Chunky body arms hugging the panda mascot) */}
          <path
            d="M 200 68 
               C 178 68, 168 84, 168 106 
               C 168 136, 182 146, 202 146 
               C 216 146, 226 132, 230 118 
               C 234 132, 244 146, 258 146 
               C 278 146, 292 136, 292 106 
               C 292 84, 282 68, 260 68 
               C 245 68, 236 78, 230 88 
               C 224 78, 215 68, 200 68 
               Z
               M 200 88 
               C 208 88, 214 96, 214 112 
               C 214 128, 208 132, 202 132 
               C 194 132, 188 124, 188 108 
               C 188 94, 194 88, 200 88 
               Z
               M 260 88 
               C 266 88, 272 94, 272 108 
               C 272 124, 266 132, 258 132 
               C 252 132, 246 128, 246 112 
               C 246 96, 252 88, 260 88 
               Z"
          />

          {/* Letter D */}
          <path
            d="M 304 58 
               L 336 58 
               C 364 58, 376 76, 376 102 
               C 376 128, 364 146, 336 146 
               L 304 146 
               Z
               M 326 76 
               L 326 128 
               L 336 128 
               C 348 128, 354 118, 354 102 
               C 354 86, 348 76, 336 76 
               Z"
          />

          {/* Letter A */}
          <path
            d="M 384 138 
               C 384 146, 408 146, 410 136 
               L 414 120 
               L 434 120 
               L 438 136 
               C 440 146, 464 146, 464 138 
               L 436 64 
               C 432 56, 416 56, 412 64 
               Z
               M 418 104 
               L 424 78 
               L 430 104 
               Z"
          />
        </g>

        {/* SUBTITLE: Cases */}
        {showSubtitle && (
          <text
            x="346"
            y="184"
            fill={mainColor}
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="34"
            fontWeight="500"
            letterSpacing="2"
          >
            Cases
          </text>
        )}
      </svg>
    </div>
  );
};
