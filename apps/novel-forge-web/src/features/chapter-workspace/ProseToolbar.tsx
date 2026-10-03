import { type ReactNode } from 'react';
import { Tooltip } from '@shadow-library/ui';

import { type ProseTool } from './use-prose-formatting';

import styles from './ProseToolbar.module.css';

const TOOLS: Record<ProseTool, { label: ReactNode; title: string }> = {
  bold: { label: <strong>B</strong>, title: 'Bold (⌘B)' },
  italic: { label: <em>I</em>, title: 'Italic (⌘I)' },
  bulleted: { label: '•', title: 'Bulleted list' },
  numbered: { label: '1.', title: 'Numbered list' },
  table: { label: '▦', title: 'Table' },
  sceneBreak: { label: '⁂', title: 'Scene break' },
};

export interface ProseToolbarProps {
  tools: readonly ProseTool[];
  onTool: (tool: ProseTool) => void;
  /** `bar` sits flush in a panel; `boxed` floats over the page's editor. */
  variant?: 'boxed' | 'bar';
  leading?: ReactNode;
  /** Set after the formatting buttons, pushed to the row's end. */
  children?: ReactNode;
}

export function ProseToolbar({ tools, onTool, variant = 'boxed', leading, children }: ProseToolbarProps): React.JSX.Element {
  return (
    <div className={styles.toolbar} data-variant={variant}>
      {leading}
      {tools.map(tool => (
        <Tooltip key={tool} content={TOOLS[tool].title}>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onTool(tool)} aria-label={TOOLS[tool].title} className={styles.toolbarBtn}>
            {TOOLS[tool].label}
          </button>
        </Tooltip>
      ))}
      <div className={styles.spacer} />
      {children}
    </div>
  );
}

export interface ProseToolbarNoteProps {
  children: ReactNode;
}

export function ProseToolbarNote({ children }: ProseToolbarNoteProps): React.JSX.Element {
  return <span className={styles.toolbarNote}>{children}</span>;
}
