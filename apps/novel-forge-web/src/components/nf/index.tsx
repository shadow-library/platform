/**
 * Importing npm packages
 */
import { ThunderboltFilled } from '@ant-design/icons';
import { Alert, Empty, Flex, Spin, Tag, Typography, theme } from 'antd';
import type { ReactElement, ReactNode } from 'react';

import type { ApiError } from '@/lib/apis';

/**
 * Importing user defined modules
 */
import { nf } from '@/constants';

const { Title, Text } = Typography;

/**
 * A tag marking an AI-generated / human-in-the-loop touchpoint.
 * Cyan in the wireframe language means "AI touched this — you decide".
 */
export function AiTag({ children = 'AI', icon = true }: { children?: ReactNode; icon?: boolean }) {
  return (
    <Tag bordered style={{ background: nf.aiBg, borderColor: nf.aiBorder, color: nf.ai, margin: 0, fontWeight: 600 }}>
      {icon && <ThunderboltFilled style={{ marginInlineEnd: 4 }} />}
      {children}
    </Tag>
  );
}

/** A conflict / warning tag with the terracotta continuity palette. */
export function ConflictTag({ children }: { children: ReactNode }) {
  return (
    <Tag bordered style={{ background: '#fdeae2', borderColor: '#eab199', color: '#b23c17', fontWeight: 600, margin: 0 }}>
      {children}
    </Tag>
  );
}

/**
 * The standard page header used across workspace screens: title on the left,
 * actions on the right, optional subtitle underneath.
 */
export function PageHeader({ title, subtitle, extra, tags }: { title: ReactNode; subtitle?: ReactNode; extra?: ReactNode; tags?: ReactNode }) {
  return (
    <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap" style={{ marginBottom: 20 }}>
      <div>
        <Flex align="center" gap={10} wrap="wrap">
          <Title level={3} style={{ margin: 0 }}>
            {title}
          </Title>
          {tags}
        </Flex>
        {subtitle && (
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {subtitle}
          </Text>
        )}
      </div>
      {extra && <Flex gap={8} wrap="wrap">{extra}</Flex>}
    </Flex>
  );
}

/**
 * Standard loading / error / empty gate for a TanStack Query. Renders children
 * only once data has arrived; keeps the wired screens free of boilerplate.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyText = 'Nothing here yet',
  emptyExtra,
  children,
}: {
  isLoading: boolean;
  error: ApiError | null;
  isEmpty?: boolean;
  emptyText?: ReactNode;
  emptyExtra?: ReactNode;
  children: ReactElement;
}) {
  if (isLoading)
    return (
      <Flex justify="center" align="center" style={{ padding: 64 }}>
        <Spin size="large" />
      </Flex>
    );
  if (error) return <Alert type="error" showIcon title="Couldn’t reach the backend" description={error.message} />;
  if (isEmpty)
    return (
      <Empty description={emptyText} style={{ padding: 48 }}>
        {emptyExtra}
      </Empty>
    );
  return children;
}

/** A neutral image/asset placeholder box with the diagonal-cross wireframe motif. */
export function AssetBox({ height = 80, width, radius = 8, color }: { height?: number; width?: number | string; radius?: number; color?: string }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        height,
        width: width ?? '100%',
        borderRadius: radius,
        flex: '0 0 auto',
        border: `1.5px solid ${token.colorBorderSecondary}`,
        background: color ?? token.colorFillTertiary,
        backgroundImage: color
          ? undefined
          : `linear-gradient(to top right, transparent calc(50% - 1px), ${token.colorBorder} calc(50% - 1px), ${token.colorBorder} calc(50% + 1px), transparent calc(50% + 1px)),
             linear-gradient(to top left, transparent calc(50% - 1px), ${token.colorBorder} calc(50% - 1px), ${token.colorBorder} calc(50% + 1px), transparent calc(50% + 1px))`,
      }}
    />
  );
}
