import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Modal,
  Pagination,
  SegmentedControl,
  Table,
  Tabs,
  Tooltip,
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

// Terracotta accent; shade 6 is the light-mode primary and shade 4 the softer dark-mode primary.
const brand: MantineColorsTuple = [
  '#fcf4ef',
  '#f9e6dc',
  '#f4cdb8',
  '#f1b597',
  '#ed9d78',
  '#cd7050',
  '#ad4f2f',
  '#923f24',
  '#78331d',
  '#5e2816',
];

// Warm paper neutrals so default buttons, inputs and dividers match the cream canvas.
const gray: MantineColorsTuple = [
  '#faf8f4',
  '#f3eee7',
  '#ebe4da',
  '#ddd5cb',
  '#cdc3b8',
  '#a59a90',
  '#776d67',
  '#5d544f',
  '#443d39',
  '#302a26',
];

// Warm charcoal scale used by Mantine for dark-mode surfaces, inputs and text.
const dark: MantineColorsTuple = [
  '#ebe6df',
  '#cdc6be',
  '#a8a29c',
  '#7d7671',
  '#4b4541',
  '#383431',
  '#2a2623',
  '#1a1715',
  '#151210',
  '#0f0d0c',
];

const fontStack =
  '"Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic UI", Meiryo, "Hiragino Sans", "Microsoft YaHei UI", sans-serif';

const serifStack =
  'ui-serif, Georgia, Cambria, "Times New Roman", "Yu Mincho", "Noto Serif JP", "Noto Serif CJK JP", "Songti SC", serif';

// Popovers, menus and modals sit one step above the canvas on paper-colored surfaces.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#fbfaf7',
    '--mantine-color-default-border': '#ddd5cb',
  },
  dark: {
    '--mantine-color-body': '#221e1c',
    '--mantine-color-default': '#2a2623',
    '--mantine-color-default-hover': '#383431',
    '--mantine-color-default-border': '#4b4541',
  },
});

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  colors: { brand, gray, dark },
  fontFamily: fontStack,
  fontFamilyMonospace: '"JetBrains Mono", "Cascadia Mono", ui-monospace, SFMono-Regular, Consolas, monospace',
  headings: {
    fontFamily: serifStack,
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '26px', lineHeight: '1.25' },
      h2: { fontSize: '20px', lineHeight: '1.3' },
      h3: { fontSize: '16px', lineHeight: '1.35' },
      h4: { fontSize: '14px', lineHeight: '1.4' },
    },
  },
  defaultRadius: 'md',
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '10px',
    xl: '14px',
  },
  cursorType: 'pointer',
  focusRing: 'auto',
  shadows: {
    xs: '0 1px 2px rgba(54, 40, 31, 0.06)',
    sm: '0 1px 2px rgba(54, 40, 31, 0.06)',
    md: '0 5px 14px rgba(54, 40, 31, 0.08)',
    lg: '0 10px 28px rgba(54, 40, 31, 0.11)',
    xl: '0 16px 42px rgba(54, 40, 31, 0.14)',
  },
  components: {
    Button: Button.extend({ defaultProps: { radius: 'md' } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: 'md' } }),
    Badge: Badge.extend({
      defaultProps: { radius: 'sm', variant: 'light' },
      styles: { root: { textTransform: 'none', fontWeight: 600 } },
    }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true, openDelay: 250 } }),
    Table: Table.extend({
      defaultProps: { verticalSpacing: 8, horizontalSpacing: 'sm', fz: 'sm', highlightOnHover: true },
    }),
    Pagination: Pagination.extend({ defaultProps: { size: 'sm', radius: 'md' } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { radius: 'md' } }),
    Tabs: Tabs.extend({ defaultProps: { radius: 'md' } }),
    Modal: Modal.extend({ defaultProps: { radius: 'lg', centered: true, shadow: 'xl' } }),
    Drawer: Drawer.extend({ defaultProps: { position: 'right' } }),
  },
});
