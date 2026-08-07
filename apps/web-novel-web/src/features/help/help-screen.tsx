import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Textarea, toast } from '@shadow-library/ui';

import { AlertIcon, BackIcon, BookIcon, ListIcon, ShieldIcon } from '@/components/icons';

import styles from './help-screen.module.css';

export type HelpTab = 'hub' | 'faq' | 'feedback' | 'about' | 'legal';

export interface HelpSearch {
  tab: HelpTab;
}

type HelpIcon = (props: { size?: number; className?: string }) => React.JSX.Element;

interface HubCard {
  tab: Exclude<HelpTab, 'hub'>;
  title: string;
  description: string;
  Icon: HelpIcon;
}

interface Faq {
  question: string;
  answer: string;
}

interface LegalSection {
  heading: string;
  body: string;
}

export const HELP_TABS: HelpTab[] = ['hub', 'faq', 'feedback', 'about', 'legal'];

const TAB_TITLES: Record<HelpTab, string> = {
  hub: 'Help & support',
  faq: 'Frequently asked questions',
  feedback: 'Send feedback',
  about: 'About Shadow Webnovel',
  legal: 'Privacy & terms',
};

const HUB_CARDS: HubCard[] = [
  { tab: 'faq', title: 'FAQ', description: 'Answers to common questions', Icon: ListIcon },
  { tab: 'feedback', title: 'Send feedback', description: 'Report a bug or suggest an idea', Icon: AlertIcon },
  { tab: 'about', title: 'About', description: 'What Shadow Webnovel is', Icon: BookIcon },
  { tab: 'legal', title: 'Privacy & terms', description: 'How your data is handled', Icon: ShieldIcon },
];

const FAQS: Faq[] = [
  {
    question: 'Do I need an account to read?',
    answer:
      'No. Browsing, reading, bookmarking and downloading all work as a guest. Signing in only adds cross-device sync, so your library and progress follow you to another device.',
  },
  {
    question: 'How do offline downloads work?',
    answer:
      'Open a novel, pick a chapter range in the download dialog, and it is saved to this device. Downloaded chapters open in the reader with no connection — find them under Downloads.',
  },
  {
    question: 'Where are my library and reading progress kept?',
    answer: 'As a guest they live on this device only. Sign in and they sync to your account, so picking up on a phone or a laptop lands you exactly where you left off.',
  },
  {
    question: 'How do I turn on mature (18+) content?',
    answer: 'Go to Settings → Content & spoilers and enable Show mature content. It is off by default, so 18+ titles stay out of browse and search until you opt in.',
  },
  {
    question: 'A chapter is missing from my download — why?',
    answer: 'Downloads only cover the range you picked. Reopen the download dialog on the novel and add the remaining chapters; ones already saved are skipped.',
  },
  {
    question: 'Can I change the reading font, size or theme?',
    answer: 'Yes. Open any chapter and use the reading toolbar to adjust font, size, line height, width and page theme live. The app theme also lives under Settings → Appearance.',
  },
  {
    question: 'Is this where I write and publish novels?',
    answer: 'No. Shadow Webnovel is a reading client. Writing happens in Novel Forge, a separate studio, and sign-in is handled by our first-party identity service.',
  },
];

const LEGAL_SECTIONS: LegalSection[] = [
  {
    heading: 'Privacy',
    body: 'We keep as little as possible. As a guest, your library, reading history and preferences stay on this device and never leave it. When you sign in, that data syncs to your account so it follows you across devices. We do not sell your data or share it with advertisers.',
  },
  {
    heading: 'Terms of service',
    body: 'Shadow Webnovel is provided as-is for personal, non-commercial reading. Do not attempt to disrupt the service, scrape it at scale, or redistribute downloaded chapters outside the app. Access may change or pause as the product evolves; continued use means you accept these terms.',
  },
  {
    heading: 'Content policy',
    body: 'Mature (18+) titles stay hidden until you opt in under Settings. Content is published by its creators through Novel Forge — report anything that breaks the rules and we will review it. Respect creators’ rights: offline downloads are for your own reading only.',
  },
];

const route = getRouteApi('/_shell/help');

export function HelpScreen(): React.JSX.Element {
  const { tab } = route.useSearch();
  const [feedback, setFeedback] = useState('');

  const onSend = (): void => {
    if (!feedback.trim()) {
      toast.warning('Add a few words before sending your feedback.');
      return;
    }
    toast.success('Thanks — your feedback has been sent to the team.');
    setFeedback('');
  };

  return (
    <div className={`${styles.page} wn-fade`}>
      {tab !== 'hub' && (
        <Link to="/help" search={{ tab: 'hub' }} className={styles.back}>
          <BackIcon size={16} />
          Back to help
        </Link>
      )}

      <h1 className={styles.title}>{TAB_TITLES[tab]}</h1>

      {tab === 'hub' && (
        <div className={styles.hubGrid}>
          {HUB_CARDS.map(card => (
            <Link key={card.tab} to="/help" search={{ tab: card.tab }} className={styles.hubCard}>
              <span className={styles.hubIcon}>
                <card.Icon size={20} />
              </span>
              <div className={styles.hubCardTitle}>{card.title}</div>
              <div className={styles.hubCardDesc}>{card.description}</div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'faq' && (
        <div className={styles.faqList}>
          {FAQS.map(faq => (
            <div key={faq.question} className={styles.faqCard}>
              <div className={styles.faqQ}>{faq.question}</div>
              <div className={styles.faqA}>{faq.answer}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'feedback' && (
        <div className={styles.feedbackCard}>
          <p className={styles.feedbackIntro}>Found a bug or have an idea? Tell us — feedback goes straight to the team.</p>
          <Textarea
            value={feedback}
            onValueChange={setFeedback}
            placeholder="Describe the issue or share your idea…"
            aria-label="Feedback"
            minRows={5}
            maxLength={1000}
            showCount
          />
          <div className={styles.feedbackActions}>
            <Button variant="primary" onClick={onSend}>
              Send feedback
            </Button>
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div className={styles.prose}>
          <p>
            Shadow Webnovel is a dedicated reading client for discovering and reading webnovels. Browse the catalog, follow the stories you love, bookmark chapters and download
            them for offline reading — entirely as a guest, no account required.
          </p>
          <p>
            It is one service in a larger ecosystem. Sign-in is handled by our first-party identity provider, and writing happens in{' '}
            <span className={styles.brandName}>Novel Forge</span>, a separate studio. Keeping reading, identity and authoring apart lets each stay focused and fast.
          </p>
          <p className={styles.version}>Shadow Webnovel v2.4.0 · design prototype</p>
        </div>
      )}

      {tab === 'legal' && (
        <div className={styles.legalList}>
          {LEGAL_SECTIONS.map(section => (
            <div key={section.heading}>
              <h2 className={styles.legalHeading}>{section.heading}</h2>
              <p className={styles.legalBody}>{section.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
