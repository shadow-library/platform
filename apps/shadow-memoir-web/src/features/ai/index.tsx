import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function AiScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Ask"
      summary="Ask a question against your own data and read the answer tonight. Remaining quota is shown before you submit, and each data class is used only with its own consent."
    />
  );
}
