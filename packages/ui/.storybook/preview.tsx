/**
 * Importing npm packages
 */
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { definePreview } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { shadowTheme } from '@/theme';

/**
 * Defining types
 */

export type Theme = 'light' | 'dark';

/**
 * Declaring the constants
 */

export const preview = definePreview({
  addons: [],

  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },

  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Mantine color scheme',
      defaultValue: 'light',
      toolbar: {
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
      },
    },
  },

  decorators: [
    (Story, context) => {
      const scheme: Theme = context.globals.theme || 'light';
      return (
        <MantineProvider theme={shadowTheme} forceColorScheme={scheme}>
          <ColorSchemeScript />
          <Story />
        </MantineProvider>
      );
    },
  ],
});

export default preview;
