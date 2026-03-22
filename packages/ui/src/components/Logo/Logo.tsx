/**
 * Importing npm packages
 */
import { Divider } from '@mantine/core';
import clsx from 'clsx';

/**
 * Importing user defined packages
 */
import { Alphabet } from './Alphabets';
import { BrandMark } from './BrandMark';
import { useLogo } from './hooks/use-logo';
import styles from './Logo.module.css';

/**
 * Defining types
 */

export type LogoVariant = 'inline' | 'icon';

export interface LogoProps {
  height?: number | string;
  variant?: LogoVariant;
  productName?: Alphabet[];
}

/**
 * Declaring the constants
 */

export function Logo({ height, productName, variant = 'inline' }: LogoProps) {
  const colors = useLogo();
  const shouldCenter = variant === 'icon' && !productName?.length;

  return (
    <div className={clsx(styles.logoRoot, shouldCenter && styles.center)} style={{ height }}>
      <BrandMark colors={colors} variant={variant === 'icon' ? 'compact' : 'full'} />
      {productName && (
        <>
          {variant !== 'icon' && <Divider className={styles.divider} mx='xs' size='sm' color={colors.dividerColor} orientation='vertical' />}
          {productName.map((Icon, index) => (
            <Icon key={index} fill={index % 2 === 1 ? colors.primaryColor : colors.secondaryColor} />
          ))}
        </>
      )}
    </div>
  );
}
