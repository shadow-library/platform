/**
 * Importing npm packages
 */
import { Typography } from 'antd';

/**
 * Importing styles
 */
import styles from './Layout.module.css';

/**
 * Declaring constants
 */
const currentYear = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className={styles.footerContainer}>
      <Typography.Text type="secondary">© {currentYear} Shadow Applications</Typography.Text>
    </footer>
  );
}
