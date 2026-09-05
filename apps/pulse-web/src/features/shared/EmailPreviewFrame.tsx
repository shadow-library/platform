import { type ReactElement } from 'react';

/** Neither `allow-scripts` nor `allow-same-origin`: write-privileged author HTML renders as an opaque-origin, script-inert frame so a read-only reviewer's pulse-web session is untouchable. */
export const EMAIL_PREVIEW_SANDBOX = '';

export interface EmailPreviewFrameProps {
  body: string;
  className?: string;
}

export function EmailPreviewFrame({ body, className }: EmailPreviewFrameProps): ReactElement {
  return <iframe title="Email preview" className={className} srcDoc={body} sandbox={EMAIL_PREVIEW_SANDBOX} />;
}
