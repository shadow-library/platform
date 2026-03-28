/**
 * Importing npm packages
 */
import { Box } from '@mantine/core';
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import styles from './AppLayout.module.css';

/**
 * Defining types
 */

interface ContentFooterProps {
  content: ReactNode;
}

/**
 * Declaring the constants
 */

export function ContentFooter({ content }: ContentFooterProps) {
  return (
    <Box component='footer' mt='xl' py='xs' className={styles.footer}>
      {content}
    </Box>
  );
}
