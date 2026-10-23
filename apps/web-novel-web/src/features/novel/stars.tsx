import { StarIcon } from '@/components/icons';

import styles from './novel-screen.module.css';

export function Stars({ value, size = 15 }: { value: number; size?: number }): React.JSX.Element {
  const filled = Math.round(value);
  return (
    <span className={styles.stars}>
      {Array.from({ length: 5 }, (_, index) => (
        <StarIcon key={index} size={size} className={index < filled ? undefined : styles.starEmpty} />
      ))}
    </span>
  );
}
