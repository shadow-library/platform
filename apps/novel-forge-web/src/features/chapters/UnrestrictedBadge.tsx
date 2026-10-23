import { Tooltip } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';

export function UnrestrictedBadge(): React.JSX.Element {
  return (
    <Tooltip content="Firewalled: this chapter's prose is never indexed, retrieved, or fed to continuity extraction. Downstream chapters see only its summary and continuation state.">
      <span>
        <StatusChip intent="warning">unrestricted</StatusChip>
      </span>
    </Tooltip>
  );
}
