/**
 * Importing npm packages
 */
import { CSSProperties } from 'react';

/**
 * Importing user defined modules
 */
import { LogoRenderConfig } from './hooks/use-logo';
import styles from './Logo.module.css';

/**
 * Declaring types
 */

interface BrandMarkProps {
  variant?: 'compact' | 'full';
  colors: LogoRenderConfig;
}

interface BrandCSSProperties extends CSSProperties {
  '--glow-color-low'?: string;
  '--glow-color-high'?: string;
}

/**
 * Declaring constants
 */

export function BrandMark({ colors, variant = 'full' }: BrandMarkProps) {
  const { primaryColor, secondaryColor } = colors;
  const containerStyles: BrandCSSProperties = {
    background: `color-mix(in srgb, ${primaryColor} 8%, transparent)`,
    border: `1px solid color-mix(in srgb, ${primaryColor} 20%, transparent)`,
    boxShadow: `0 2px 4px rgba(0, 0, 0, 0.3), 0 8px 24px color-mix(in srgb, ${primaryColor} 15%, transparent), 0 0 0 color-mix(in srgb, ${primaryColor} 12%, transparent) inset`,
    '--glow-color-low': `color-mix(in srgb, ${primaryColor} 30%, transparent)`,
    '--glow-color-high': `color-mix(in srgb, ${primaryColor} 70%, transparent)`,
  };

  return variant === 'compact' ? (
    <div className={styles.compactBrandContainer} style={containerStyles}>
      <svg viewBox='0 0 290 410' style={{ stroke: primaryColor, filter: `drop-shadow(0 4px 12px color-mix(in srgb, ${primaryColor} 50%, transparent))` }} fill='none'>
        <path d='M 25 345 L 70 385 210 385 255 340 255 265 235 245 45 165 25 145 25 70 70 25 210 25 255 70' strokeLinecap='round' />
        <path d='M 25 345 L 25 285 M 255 115 L 255 70' />
      </svg>
    </div>
  ) : (
    <>
      {/* S */}
      <svg viewBox='0 0 290 410' style={{ stroke: primaryColor }} fill='none'>
        <path d='M 25 345 L 70 385 210 385 255 340 255 265 235 245 45 165 25 145 25 70 70 25 210 25 255 70' strokeLinecap='round' />
        <path d='M 25 345 L 25 285 M 255 115 L 255 70' />
      </svg>

      {/* H */}
      <svg viewBox='0 0 290 410' style={{ stroke: secondaryColor }}>
        <path d='M 25 410 L 25 0' />
        <path d='M 25 205 L 265 205' />
        <path d='M 265 410 L 265 0' />
      </svg>

      {/* A */}
      <svg viewBox='0 0 350 410' style={{ fill: primaryColor }}>
        <path d='M 0 410 L 150 0 200 0 350 410 100 410 118.2 360 283 360 175 50 50 410 0 410' />
      </svg>

      {/* D */}
      <svg viewBox='0 0 300 410' style={{ fill: secondaryColor }}>
        <path d='M 0 280 L 50 255 50 360 230 360 250 340 250 155 300 130 300 365 255 410 0 410 0 280' />
        <path d='M 0 230 L 50 205 50 50 230 50 250 70 250 105 300 80 300 45 255 0 0 0 0 230' />
      </svg>

      {/* O */}
      <svg viewBox='0 0 290 410' style={{ stroke: primaryColor }} fill='none'>
        <path d='M 25 70 L 25 345 70 385 210 385 255 340 255 70 210 25 70 25 25 70' strokeLinecap='round' />
      </svg>

      {/* W */}
      <svg viewBox='0 0 430 410' style={{ fill: secondaryColor }}>
        <path d='M 0 0 L 86 410 136 410 215 148 294 410 344 410 430 0 380 0 314.5 312 244 80 186 80 115.5 312.5 50 0 0 0' />
      </svg>
    </>
  );
}
