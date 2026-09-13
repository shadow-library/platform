import { createFileRoute } from '@tanstack/react-router';

import { PageContainer, PageHeader } from '@/components/nf';

export const Route = createFileRoute('/novels/$novelId/translation')({
  component: TranslationScreen,
});

/** Placeholder — the full Translation screen (progress card, setup, terminology, chapters) is a later task. */
function TranslationScreen(): React.JSX.Element {
  return (
    <PageContainer>
      <PageHeader title="Translation" />
    </PageContainer>
  );
}
