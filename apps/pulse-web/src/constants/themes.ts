/**
 * Importing npm packages
 */
import { theme } from 'antd';
import { type ThemeConfig } from 'antd';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    // Brand
    colorPrimary: '#5B2D8B',
    colorPrimaryHover: '#6F3FB0',
    colorPrimaryActive: '#4A2373',
    colorPrimaryBg: '#E9DDF4',
    colorPrimaryBorder: '#C9B1E6',

    // Backgrounds
    colorBgBase: '#F7F7FA',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBgLayout: '#F2F3F8',

    // Text
    colorText: '#1F1F1F',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8C8C8C',
    colorTextDisabled: '#BFBFBF',

    // Borders & Dividers
    colorBorder: '#D9D9D9',
    colorBorderSecondary: '#E6E6EB',

    // Status
    colorSuccess: '#3CB371',
    colorWarning: '#FAAD14',
    colorError: '#D9363E',
    colorInfo: '#5B8FF9',

    // Typography & Shape
    fontSize: 14,
    borderRadius: 8,
    controlHeight: 40,

    // Focus & Shadows
    controlOutline: 'rgba(91, 45, 139, 0.25)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
  },

  components: {
    Layout: {
      headerBg: '#141418', // graphite from logo
      bodyBg: '#F2F3F8',
      footerBg: '#F2F3F8',
      siderBg: '#141418', // sider matches header
      triggerBg: '#141418', // collapse trigger
      triggerColor: '#EDEDED',
    },

    Menu: {
      // sidebar nav palette (works for Menu inside Sider)
      darkItemBg: '#141418',
      darkSubMenuItemBg: '#141418',
      darkPopupBg: '#1B1B22',

      darkItemColor: '#CFCFDC',
      darkItemHoverColor: '#FFFFFF',
      darkItemSelectedColor: '#FFFFFF',

      // selected/active uses brand purple
      darkItemSelectedBg: '#5B2D8B',
      darkItemHoverBg: 'rgba(91, 45, 139, 0.30)',
    },
  },
} satisfies ThemeConfig;

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    // Brand
    colorPrimary: '#8A5FD2',
    colorPrimaryHover: '#9F7AE8',
    colorPrimaryActive: '#7449B8',
    colorPrimaryBg: '#2B1F3A',
    colorPrimaryBorder: '#4E3A66',

    // Backgrounds
    colorBgBase: '#0F0F14',
    colorBgContainer: '#1A1A22',
    colorBgElevated: '#1F1F2A',
    colorBgLayout: '#0D0D12',

    // Text
    colorText: '#EDEDED',
    colorTextSecondary: '#B0B0C3',
    colorTextTertiary: '#8A8AA3',
    colorTextDisabled: '#5A5A6E',

    // Borders & Dividers
    colorBorder: '#2A2A35',
    colorBorderSecondary: '#343445',

    // Status
    colorSuccess: '#4FD6A2',
    colorWarning: '#F5C043',
    colorError: '#FF5C5C',
    colorInfo: '#6DAAFB',

    // Typography & Shape
    fontSize: 14,
    borderRadius: 8,
    controlHeight: 40,

    // Focus & Shadows
    controlOutline: 'rgba(138, 95, 210, 0.35)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
  },
} satisfies ThemeConfig;
