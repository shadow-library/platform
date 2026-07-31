/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Pagination } from './Pagination';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Pagination',
  component: Pagination,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Pagination>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [page, setPage] = useState(4);
    return <Pagination page={page} onPageChange={setPage} total={3204} pageSize={50} />;
  },
};

/** With a page-size Select. */
export const WithPageSize: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(50);
    return <Pagination page={page} onPageChange={setPage} total={3204} pageSize={size} onPageSizeChange={setSize} />;
  },
};

/** Cursor mode — only Prev/Next when totals are unknown. */
export const Cursor: Story = {
  render: () => <Pagination hasPrev hasNext onPrev={() => {}} onNext={() => {}} />,
};

/** Compact — arrows + position text. */
export const Compact: Story = {
  render: () => {
    const [page, setPage] = useState(4);
    return <Pagination compact summary={false} page={page} onPageChange={setPage} total={3250} pageSize={50} />;
  },
};
