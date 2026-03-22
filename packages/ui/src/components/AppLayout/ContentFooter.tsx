/**
 * Importing npm packages
 */
import { Box, Text } from '@mantine/core';

/**
 * Importing user defined packages
 */
import styles from './AppLayout.module.css';
import { type FooterConfig } from './layout.types';

/**
 * Defining types
 */

interface ContentFooterProps {
  appName: string;
  footer?: FooterConfig;
}

/**
 * Declaring the constants
 */

export function ContentFooter({ appName, footer }: ContentFooterProps) {
  return (
    <Box component='footer' mt='xl' py='xs' className={styles.footer}>
      {footer?.content ?? (
        <Text size='xs' c='dimmed' ta='center'>
          {appName}
          {footer?.version ? ` \u00B7 ${footer.version}` : ''}
        </Text>
      )}
    </Box>
  );
}
