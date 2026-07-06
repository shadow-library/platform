/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Segmented } from 'antd';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { PageHeader } from '@/components/nf';
import { BibleDocEditor } from '@/features/bible/BibleDocEditor';
import { type BibleSection } from '@/lib/apis';

export const Route = createFileRoute('/novels/$novelId/world')({
  component: World,
});

const sections: { label: string; value: BibleSection }[] = [
  { label: 'World', value: 'world' },
  { label: 'Power system', value: 'power' },
];

function World() {
  const { novelId } = Route.useParams();
  const [section, setSection] = useState<BibleSection>('world');

  return (
    <div>
      <PageHeader
        title="World setting"
        subtitle="The physical and cultural bedrock every location and faction inherits."
        extra={<Segmented value={section} onChange={v => setSection(v as BibleSection)} options={sections} />}
      />
      <BibleDocEditor projectId={novelId} section={section} slug="overview" placeholder="Geography, history, cultures, cosmology…" />
    </div>
  );
}
