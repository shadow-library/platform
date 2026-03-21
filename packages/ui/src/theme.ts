/**
 * Importing npm packages
 */
import { ActionIcon, Badge, Card, createTheme, Modal, Paper, Table, Tooltip, type MantineColorsTuple } from '@mantine/core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Shadow Apps — Shared Mantine Theme (v8)
 *
 * Primary:  shadowCyan  [5] → #00bfb8 (dark) / [6] → #009e98 (light)
 * Neutral:  shadowSlate [8] → #141e2e (dark background)
 *
 * Usage:
 *   <MantineProvider theme={shadowTheme} defaultColorScheme="dark">
 *     <App />
 *   </MantineProvider>
 */

const shadowCyan: MantineColorsTuple = [
  '#e8fffe', // 0
  '#c0f9f7', // 1
  '#85f0ec', // 2
  '#40e3dd', // 3
  '#12d4cc', // 4
  '#00bfb8', // 5 — primary on dark ★
  '#009e98', // 6 — primary on light ★
  '#007d78', // 7
  '#005e5a', // 8
  '#003e3b', // 9
];

const shadowSlate: MantineColorsTuple = [
  '#f5f6f8', // 0
  '#e5e8ed', // 1 — light border
  '#c8cdd6', // 2
  '#a2aab6', // 3
  '#788596', // 4
  '#546070', // 5 — muted text
  '#3a4555', // 6
  '#253040', // 7 — dark border
  '#141e2e', // 8 — dark background ★
  '#0c1220', // 9
];

export const shadowTheme = createTheme({
  colors: {
    shadowCyan,
    shadowSlate,
  },
  primaryColor: 'shadowCyan',
  primaryShade: { light: 6, dark: 5 },
  autoContrast: true,

  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  fontSizes: {
    xs: '11px',
    sm: '13px',
    md: '14px',
    lg: '16px',
    xl: '18px',
  },
  lineHeights: {
    xs: '1.4',
    sm: '1.5',
    md: '1.7',
    lg: '1.8',
    xl: '1.9',
  },
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: '500',
    sizes: {
      h1: { fontSize: '28px', lineHeight: '1.3' },
      h2: { fontSize: '22px', lineHeight: '1.35' },
      h3: { fontSize: '18px', lineHeight: '1.4' },
      h4: { fontSize: '16px', lineHeight: '1.45' },
      h5: { fontSize: '14px', lineHeight: '1.5' },
      h6: { fontSize: '13px', lineHeight: '1.5' },
    },
  },

  defaultRadius: 'sm',
  radius: {
    xs: '2px',
    sm: '3px',
    md: '4px',
    lg: '6px',
    xl: '8px',
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.08)',
    sm: '0 2px 6px rgba(0, 0, 0, 0.10)',
    md: '0 4px 12px rgba(0, 0, 0, 0.12)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.14)',
    xl: '0 16px 40px rgba(0, 0, 0, 0.16)',
  },

  components: {
    Card: Card.extend({
      defaultProps: {
        radius: 'md',
        padding: 'lg',
      },
      styles: {
        root: {
          border: `0.5px solid light-dark(${shadowSlate[1]}, ${shadowSlate[7]})`,
        },
      },
    }),

    Badge: Badge.extend({
      defaultProps: {
        variant: 'light',
      },
    }),

    Paper: Paper.extend({
      defaultProps: {
        radius: 'md',
      },
    }),

    Modal: Modal.extend({
      defaultProps: {
        radius: 'md',
        centered: true,
      },
    }),

    Tooltip: Tooltip.extend({
      defaultProps: {
        radius: 'xs',
      },
    }),

    ActionIcon: ActionIcon.extend({
      defaultProps: {
        variant: 'subtle',
      },
    }),

    Table: Table.extend({
      defaultProps: {
        striped: false,
        highlightOnHover: true,
        withColumnBorders: false,
      },
    }),
  },

  cursorType: 'pointer',
  focusRing: 'auto',
});

export type ShadowTheme = typeof shadowTheme;
