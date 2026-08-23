import { useNavigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { type CommandItem, CommandPalette } from '@shadow-library/ui';

import { AiIcon, LogIcon, MoneyIcon, PlanIcon, QuestIcon, TodayIcon } from '@/components/icons';

export interface QuickCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Quick Capture — Cmd/Ctrl+K anywhere, the promoted action on touch. Until the parser and the domain
 * commands exist it registers navigation only; the shortcut, the surface and the entry points are wired now
 * so no screen built later has to invent its own way in.
 */
export function QuickCapture({ open, onOpenChange }: QuickCaptureProps): ReactElement {
  const navigate = useNavigate();
  const go = (to: string) => () => void navigate({ to });

  const commands: CommandItem[] = [
    { id: 'log', group: 'Capture', label: 'Quick log', icon: <LogIcon size={16} />, keywords: ['journal', 'meal', 'weight', 'steps', 'water', 'sleep'], onRun: go('/log') },
    { id: 'expense', group: 'Capture', label: 'Add an expense', icon: <MoneyIcon size={16} />, keywords: ['spend', 'receipt', 'subscription'], onRun: go('/finance') },
    { id: 'quest', group: 'Capture', label: 'New quest', icon: <QuestIcon size={16} />, onRun: go('/quests/new') },
    { id: 'today', group: 'Go to', label: 'Today', icon: <TodayIcon size={16} />, onRun: go('/') },
    { id: 'plan', group: 'Go to', label: 'Planning Board', icon: <PlanIcon size={16} />, onRun: go('/plan') },
    { id: 'ask', group: 'Go to', label: 'Ask', icon: <AiIcon size={16} />, onRun: go('/ai') },
  ];

  return <CommandPalette commands={commands} open={open} onOpenChange={onOpenChange} placeholder="Log something, or jump to a screen" emptyMessage="Nothing matches that yet" />;
}
