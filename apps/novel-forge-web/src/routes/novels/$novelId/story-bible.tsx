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

export const Route = createFileRoute('/novels/$novelId/story-bible')({
  component: StoryBible,
});

const sections: { label: string; value: BibleSection }[] = [
  { label: 'Overview', value: 'project' },
  { label: 'Story state', value: 'story_state' },
  { label: 'Lore', value: 'lore' },
  { label: 'AI notes', value: 'ai' },
];

function StoryBible() {
  const { novelId } = Route.useParams();
  const [section, setSection] = useState<BibleSection>('project');

  return (
    <div>
      <PageHeader
        title="Story Bible"
        subtitle="The canonical source of truth every generation is grounded in. Edit inline; changes are versioned by the backend."
        extra={<Segmented value={section} onChange={v => setSection(v as BibleSection)} options={sections} />}
      />
      <BibleDocEditor projectId={novelId} section={section} slug="overview" placeholder="Premise, themes, and the shape of the story…" />
    </div>
  );
}
