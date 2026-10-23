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
  type MantineColorsTuple,
} from '@mantine/core';

const brand: MantineColorsTuple = [
  '#fff0f5',
  '#fcdfe9',
  '#f6bdd0',
  '#f09ab7',
  '#ea7ca1',
  '#e06690',
  '#c94f78',
  '#b1426a',
  '#96375a',
  '#7b2c4a',
];

// Warm, slightly rosy neutrals so default buttons, inputs and dividers match the palette.
const gray: MantineColorsTuple = [
  '#fdf8fa',
  '#f7eff2',
  '#eee1e7',
  '#e2d1d9',
  '#cfbac4',
  '#a58e9a',
  '#88727e',
  '#6c5763',
  '#51404a',
  '#3a2d35',
];

// Plum-tinted dark scale used by Mantine for dark-mode surfaces, inputs and text.
const dark: MantineColorsTuple = [
  '#f3e5ec',
  '#d9c3ce',
  '#b39aa7',
  '#8a7280',
  '#4c3643',
  '#3b2a34',
  '#2e212a',
  '#261b22',
  '#1f161c',
  '#170f14',
];

const fontStack =
  'Inter, "Segoe UI Variable Text", "Segoe UI", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic UI", Meiryo, "Hiragino Sans", "Microsoft YaHei UI", system-ui, -apple-system, sans-serif';

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  colors: { brand, gray, dark },
  fontFamily: fontStack,
  fontFamilyMonospace: '"JetBrains Mono", "Cascadia Mono", ui-monospace, SFMono-Regular, Consolas, monospace',
  headings: {
    fontFamily: fontStack,
    fontWeight: '650',
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
    lg: '12px',
    xl: '16px',
  },
  cursorType: 'pointer',
  components: {
    Button: Button.extend({ defaultProps: { radius: 'md' } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: 'md' } }),
    Badge: Badge.extend({ defaultProps: { radius: 'sm', variant: 'light' } }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true, openDelay: 250 } }),
    Table: Table.extend({
      defaultProps: { verticalSpacing: 8, horizontalSpacing: 'sm', fz: 'sm', highlightOnHover: true },
    }),
    Pagination: Pagination.extend({ defaultProps: { size: 'sm', radius: 'md' } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { radius: 'md' } }),
    Tabs: Tabs.extend({ defaultProps: { radius: 'md' } }),
    Modal: Modal.extend({ defaultProps: { radius: 'lg', centered: true, overlayProps: { blur: 2 } } }),
    Drawer: Drawer.extend({ defaultProps: { position: 'right', overlayProps: { blur: 2 } } }),
  },
});
