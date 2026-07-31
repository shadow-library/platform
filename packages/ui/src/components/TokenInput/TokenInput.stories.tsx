/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { TokenInput } from './TokenInput';
import { type TokenValue } from './TokenInput.types';

/**
 * Declaring the constants
 */
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const meta = {
  title: 'Components/TokenInput',
  component: TokenInput,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TokenInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Emails: Story = {
  render: () => {
    const [tokens, setTokens] = useState<TokenValue[]>([
      { value: 'ana@acme.com', valid: true },
      { value: 'jo@acme.com', valid: true },
    ]);
    return <TokenInput value={tokens} onValueChange={setTokens} validate={isEmail} placeholder="name@company.com" aria-label="Recipients" />;
  },
};

export const WithInvalid: Story = {
  render: () => {
    const [tokens, setTokens] = useState<TokenValue[]>([
      { value: 'ana@acme.com', valid: true },
      { value: 'not-an-email', valid: false },
    ]);
    return <TokenInput value={tokens} onValueChange={setTokens} validate={isEmail} aria-label="Recipients" />;
  },
};
