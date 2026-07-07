/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { SplitPane } from './SplitPane';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/SplitPane',
  component: SplitPane,
  parameters: { layout: 'fullscreen' },
  args: { children: null },
} satisfies Meta<typeof SplitPane>;

export default meta;

type Story = StoryObj<typeof meta>;

function Panel({ title, children }: { title: string; children?: string }) {
  return (
    <div style={{ height: '100%', padding: 16, background: 'var(--sh-surface-card)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      <p style={{ fontSize: 13, color: 'var(--sh-text-secondary)' }}>{children}</p>
    </div>
  );
}

export const EditorInspector: Story = {
  render: () => (
    <div style={{ height: 360, border: '1px solid var(--sh-border-default)', borderRadius: 8, overflow: 'hidden' }}>
      <SplitPane direction='horizontal' autoSaveId='sb-editor'>
        <SplitPane.Pane defaultSize='25%' minSize={160} maxSize='45%' collapsible collapseLabel='Explorer'>
          <Panel title='Explorer'>Drag the handle. Double-click resets. Drag past the min to collapse.</Panel>
        </SplitPane.Pane>
        <SplitPane.Handle aria-label='Resize explorer' />
        <SplitPane.Pane minSize={280}>
          <Panel title='Editor'>The primary workspace fills the remaining space.</Panel>
        </SplitPane.Pane>
      </SplitPane>
    </div>
  ),
};

export const EditorConsole: Story = {
  render: () => (
    <div style={{ height: 360, border: '1px solid var(--sh-border-default)', borderRadius: 8, overflow: 'hidden' }}>
      <SplitPane direction='vertical' autoSaveId='sb-console'>
        <SplitPane.Pane minSize={120}>
          <Panel title='Editor'>Vertical split — the handle resizes rows.</Panel>
        </SplitPane.Pane>
        <SplitPane.Handle aria-label='Resize console' />
        <SplitPane.Pane defaultSize='30%' minSize={80} collapsible collapseLabel='Console'>
          <Panel title='Console'>Auxiliary pane, collapsible.</Panel>
        </SplitPane.Pane>
      </SplitPane>
    </div>
  ),
};

export const NestedWorkspace: Story = {
  render: () => (
    <div style={{ height: 400, border: '1px solid var(--sh-border-default)', borderRadius: 8, overflow: 'hidden' }}>
      <SplitPane direction='horizontal'>
        <SplitPane.Pane defaultSize='22%' minSize={140} collapsible collapseLabel='Files'>
          <Panel title='Files'>Left rail.</Panel>
        </SplitPane.Pane>
        <SplitPane.Handle aria-label='Resize files' />
        <SplitPane.Pane minSize={280}>
          <SplitPane direction='vertical'>
            <SplitPane.Pane minSize={120}>
              <Panel title='Editor'>Nested vertical split inside the primary pane.</Panel>
            </SplitPane.Pane>
            <SplitPane.Handle aria-label='Resize terminal' />
            <SplitPane.Pane defaultSize='30%' minSize={80} collapsible collapseLabel='Terminal'>
              <Panel title='Terminal'>Bottom pane.</Panel>
            </SplitPane.Pane>
          </SplitPane>
        </SplitPane.Pane>
      </SplitPane>
    </div>
  ),
};
