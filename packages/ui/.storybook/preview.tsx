/**
 * Importing npm packages
 */

import { type Decorator, definePreview } from '@storybook/react-vite';
import { useEffect } from 'react';

/**
 * Importing user defined packages
 */
import '@/styles/index.css';

/**
 * Declaring the constants
 */

/** Applies the toolbar-selected theme to the preview root, exactly as a consumer would. */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme === 'dark' ? 'dark' : 'light';
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    return () => root.removeAttribute('data-theme');
  }, [theme]);
  return <Story />;
};

export const preview = definePreview({
  addons: [],

  decorators: [withTheme],

  globalTypes: {
    theme: {
      description: 'Shadow UI color theme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },

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
});

export default preview;
