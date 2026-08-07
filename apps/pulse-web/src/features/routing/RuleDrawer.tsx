import { type ReactElement } from 'react';
import { DescriptionList, Drawer } from '@shadow-library/ui';

import { AnyOrValue, formatDateTime, Mono, OutlineBadge, StatusBadge } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type SenderProfileResponse } from '@/lib';

import { type RoutingRule } from './forms';
import styles from './Routing.module.css';

interface RuleDrawerProps {
  rule: RoutingRule | null;
  profile?: SenderProfileResponse;
  onOpenChange: (open: boolean) => void;
}

export default function RuleDrawer({ rule, profile, onOpenChange }: RuleDrawerProps): ReactElement {
  return (
    <Drawer open={!!rule} onOpenChange={onOpenChange} placement="right" size="md">
      <Drawer.Header title="Routing rule" meta="Matched sender profile" />
      <Drawer.Body>
        {rule ? (
          <>
            <div className={styles.drawerLabel}>Match conditions</div>
            <DescriptionList layout="row" termWidth={140}>
              <DescriptionList.Item term="Message type">{rule.messageType ? <OutlineBadge>{rule.messageType}</OutlineBadge> : <AnyOrValue />}</DescriptionList.Item>
              <DescriptionList.Item term="Region">
                <AnyOrValue value={rule.region} />
              </DescriptionList.Item>
              <DescriptionList.Item term="Service">
                <AnyOrValue value={rule.service} />
              </DescriptionList.Item>
            </DescriptionList>

            <div className={styles.divider} />

            <div className={styles.drawerLabel}>Matched sender profile</div>
            {profile ? (
              <DescriptionList layout="row" termWidth={140}>
                <DescriptionList.Item term="Key">
                  <Mono>{profile.key}</Mono>
                </DescriptionList.Item>
                <DescriptionList.Item term="Display name">{profile.displayName || '—'}</DescriptionList.Item>
                <DescriptionList.Item term="Status">
                  <StatusBadge active={profile.isActive} />
                </DescriptionList.Item>
                <DescriptionList.Item term="Created">{formatDateTime(profile.createdAt)}</DescriptionList.Item>
              </DescriptionList>
            ) : (
              <span className={controls.danger}>Sender profile unlinked</span>
            )}
          </>
        ) : null}
      </Drawer.Body>
    </Drawer>
  );
}
