/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef } from 'react';

/**
 * Defining types
 */
export type SkeletonShape = 'line' | 'rect' | 'circle';

export interface SkeletonProps extends ComponentPropsWithoutRef<'span'> {
  /** line (text), rect (blocks), or circle (avatars). @default 'line' */
  shape?: SkeletonShape;
  /** Width — match the real element to avoid layout shift. */
  width?: number | string;
  /** Height — defaults per shape; circles mirror the width. */
  height?: number | string;
  /** Corner radius override (rect). */
  radius?: number | string;
}

export interface SkeletonTableProps extends ComponentPropsWithoutRef<'div'> {
  rows?: number;
  columns?: number;
}

export interface SkeletonListProps extends ComponentPropsWithoutRef<'div'> {
  rows?: number;
}

export type SkeletonCardProps = ComponentPropsWithoutRef<'div'>;
