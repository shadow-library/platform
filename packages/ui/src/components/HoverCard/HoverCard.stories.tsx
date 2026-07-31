/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { HoverCard } from './HoverCard';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/HoverCard',
  component: HoverCard,
  parameters: { layout: 'centered' },
  args: { children: null },
} satisfies Meta<typeof HoverCard>;

export default meta;

type Story = StoryObj<typeof meta>;

function UserPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar name="Mira Kessler" />
        <div>
          <div style={{ fontWeight: 600 }}>Mira Kessler</div>
          <div style={{ fontSize: 12, color: 'var(--sh-text-tertiary)' }}>Staff Engineer · Platform</div>
        </div>
        <Badge intent="success" dot style={{ marginLeft: 'auto' }}>
          Online
        </Badge>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--sh-text-secondary)' }}>Owns deploy tooling and the canary pipeline. On-call for Platform this week.</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--sh-border-subtle)' }}>
        <span style={{ fontSize: 12, color: 'var(--sh-text-tertiary)' }}>214 deploys · UTC−5</span>
        <Button variant="text" size="sm">
          View profile
        </Button>
      </div>
    </div>
  );
}

export const User: Story = {
  render: () => (
    <p style={{ maxWidth: 420 }}>
      Deploy approved by{' '}
      <HoverCard card={<UserPreview />} aria-label="Mira Kessler preview">
        <a href="#/people/mira" style={{ textDecoration: 'underline dashed', textUnderlineOffset: 2 }}>
          @mira
        </a>
      </HoverCard>{' '}
      after the canary cleared.
    </p>
  ),
};

export const AsyncLoading: Story = {
  render: () => (
    <p>
      Owner:{' '}
      <HoverCard
        width={320}
        content={() => new Promise<{ name: string }>(resolve => setTimeout(() => resolve({ name: 'checkout-service' }), 800))}
        render={data => <strong>{data.name}</strong>}
        fallback={<span style={{ color: 'var(--sh-text-tertiary)' }}>Loading preview…</span>}
      >
        <a href="#/repos/checkout" style={{ textDecoration: 'underline dashed', textUnderlineOffset: 2 }}>
          checkout-service
        </a>
      </HoverCard>
    </p>
  ),
};
