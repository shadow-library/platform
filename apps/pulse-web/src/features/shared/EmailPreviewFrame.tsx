import { type ReactElement } from 'react';

/** No `allow-scripts` or `allow-same-origin`: author HTML renders in an opaque-origin, script-inert frame that cannot reach the reviewer's pulse-web session. */
const EMAIL_PREVIEW_SANDBOX = '';

export interface EmailPreviewFrameProps {
  body: string;
  className?: string;
}

export function EmailPreviewFrame({ body, className }: EmailPreviewFrameProps): ReactElement {
  return <iframe title="Email preview" className={className} srcDoc={body} sandbox={EMAIL_PREVIEW_SANDBOX} />;
}
