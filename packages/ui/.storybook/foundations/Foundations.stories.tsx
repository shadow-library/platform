/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Foundations.module.css';

/**
 * Defining types
 */
interface TokenRow {
  name: string;
  cssVar: string;
}

/**
 * Declaring the constants
 */
const surfaces: TokenRow[] = [
  { name: 'surface-app', cssVar: '--sh-surface-app' },
  { name: 'surface-card', cssVar: '--sh-surface-card' },
  { name: 'surface-well', cssVar: '--sh-surface-well' },
  { name: 'surface-raised', cssVar: '--sh-surface-raised' },
  { name: 'bg-hover', cssVar: '--sh-bg-hover' },
  { name: 'bg-pressed', cssVar: '--sh-bg-pressed' },
];

const text: TokenRow[] = [
  { name: 'text-primary', cssVar: '--sh-text-primary' },
  { name: 'text-secondary', cssVar: '--sh-text-secondary' },
  { name: 'text-tertiary', cssVar: '--sh-text-tertiary' },
  { name: 'text-placeholder', cssVar: '--sh-text-placeholder' },
];

const brand: TokenRow[] = [
  { name: 'accent', cssVar: '--sh-accent' },
  { name: 'accent-hover', cssVar: '--sh-accent-hover' },
  { name: 'accent-active', cssVar: '--sh-accent-active' },
  { name: 'accent-soft', cssVar: '--sh-accent-soft' },
];

const borders: TokenRow[] = [
  { name: 'border-subtle', cssVar: '--sh-border-subtle' },
  { name: 'border-default', cssVar: '--sh-border-default' },
  { name: 'border-strong', cssVar: '--sh-border-strong' },
  { name: 'border-interactive', cssVar: '--sh-border-interactive' },
  { name: 'border-focus', cssVar: '--sh-border-focus' },
];

const intents = ['neutral', 'success', 'warning', 'danger', 'info'] as const;

const typeScale: { name: string; className: string | undefined }[] = [
  { name: 'Display', className: styles.display },
  { name: 'Heading 1', className: styles.h1 },
  { name: 'Heading 2', className: styles.h2 },
  { name: 'Heading 3', className: styles.h3 },
  { name: 'Body Large', className: styles.bodyLg },
  { name: 'Body', className: styles.body },
  { name: 'Body Small', className: styles.bodySm },
  { name: 'Caption', className: styles.caption },
  { name: 'Code', className: styles.code },
];

const radii: { name: string; className: string | undefined }[] = [
  { name: 'sm', className: styles.radiusSm },
  { name: 'md', className: styles.radiusMd },
  { name: 'lg', className: styles.radiusLg },
  { name: 'xl', className: styles.radiusXl },
  { name: '2xl', className: styles.radius2xl },
  { name: 'full', className: styles.radiusFull },
];

const elevations: { name: string; className: string | undefined }[] = [
  { name: 'e1', className: styles.e1 },
  { name: 'e2', className: styles.e2 },
  { name: 'e3', className: styles.e3 },
];

function Swatch({ name, cssVar }: TokenRow) {
  return (
    <div className={styles.swatch}>
      <div className={styles.swatchChip} style={{ background: `var(${cssVar})` }} />
      <span className={styles.swatchLabel}>{name}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

const meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className={styles.gallery}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Colors: Story = {
  render: () => (
    <div className={styles.stack}>
      <Section title='Surfaces & backgrounds'>
        <div className={styles.swatchGrid}>
          {surfaces.map(t => (
            <Swatch key={t.name} {...t} />
          ))}
        </div>
      </Section>
      <Section title='Text'>
        <div className={styles.swatchGrid}>
          {text.map(t => (
            <Swatch key={t.name} {...t} />
          ))}
        </div>
      </Section>
      <Section title='Brand'>
        <div className={styles.swatchGrid}>
          {brand.map(t => (
            <Swatch key={t.name} {...t} />
          ))}
        </div>
      </Section>
      <Section title='Borders'>
        <div className={styles.swatchGrid}>
          {borders.map(t => (
            <Swatch key={t.name} {...t} />
          ))}
        </div>
      </Section>
    </div>
  ),
};

export const Intents: Story = {
  render: () => (
    <div className={styles.stack}>
      {intents.map(intent => (
        <div key={intent} className={styles.intentRow}>
          <span className={styles.intentName}>{intent}</span>
          <span className={styles.badgeSubtle} style={{ background: `var(--sh-${intent}-bg-subtle)`, color: `var(--sh-${intent}-text-on-subtle)` }}>
            subtle
          </span>
          <span className={styles.badgeSolid} style={{ background: `var(--sh-${intent}-solid)`, color: `var(--sh-${intent}-on-solid)` }}>
            solid
          </span>
          <span className={styles.intentText} style={{ color: `var(--sh-${intent}-text)` }}>
            text
          </span>
        </div>
      ))}
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div className={styles.stack}>
      {typeScale.map(t => (
        <div key={t.name} className={styles.typeRow}>
          <span className={styles.typeName}>{t.name}</span>
          <span className={cn(styles.typeSample, t.className)}>The quick brown fox</span>
        </div>
      ))}
    </div>
  ),
};

export const RadiusAndElevation: Story = {
  render: () => (
    <div className={styles.stack}>
      <Section title='Radius'>
        <div className={styles.tokenRow}>
          {radii.map(r => (
            <div key={r.name} className={styles.tokenItem}>
              <div className={cn(styles.radiusChip, r.className)} />
              <span className={styles.swatchLabel}>{r.name}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title='Elevation (light mode)'>
        <div className={styles.tokenRow}>
          {elevations.map(e => (
            <div key={e.name} className={styles.tokenItem}>
              <div className={cn(styles.elevationChip, e.className)} />
              <span className={styles.swatchLabel}>{e.name}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  ),
};
