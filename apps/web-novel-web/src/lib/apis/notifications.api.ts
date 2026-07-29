/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { namespacedKey, readLocal, removeLocal, writeLocal } from '@/lib/local-store';

import { type ApiError } from './transport';

/**
 * Defining types
 */
export type NotificationType = 'chapter' | 'reply' | 'download' | 'system';

/** A single in-app "Updates" entry. `createdAt` is an ISO instant; the relative label is derived at render. */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** Present when opening the update should land the reader on a novel; system notices omit it. */
  novelSlug?: string;
}

/**
 * Declaring the constants
 *
 * There is no webnovel-server notifications endpoint yet, so Updates are entirely device-local: a
 * localStorage mirror seeded with a realistic sample the first time it is read in the browser. The mirror
 * is namespaced by user id (guests fall back to a `guest` namespace) so one account's Updates never bleed
 * into another's — mirroring the library and progress stores. SSR-safe: the accessors no-op without
 * `window`, so the server renders an empty list and the seed lands only on the client.
 */
const NOTIFICATIONS_STORAGE_KEY = 'webnovel:notifications';

export const notificationsKeys = {
  all: ['notifications'] as const,
};

/** Minutes-ago as an ISO instant — evaluated at seed time (browser only), so the sample carries fixed timestamps. */
function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function seedNotifications(): Notification[] {
  return [
    {
      id: 'ntf-chapter-clockwork',
      type: 'chapter',
      title: 'New chapter · Clockwork Saint',
      body: 'Chapter 342 “The Ninth Movement” is now live.',
      createdAt: isoMinutesAgo(18),
      read: false,
      novelSlug: 'clockwork-saint',
    },
    {
      id: 'ntf-reply-ten-thousand',
      type: 'reply',
      title: 'Sword_Ascendant replied to your comment',
      body: '“That parallel to the prologue completely reframes the duel.”',
      createdAt: isoMinutesAgo(55),
      read: false,
      novelSlug: 'ten-thousand-swords-return',
    },
    {
      id: 'ntf-download-starfall',
      type: 'download',
      title: 'Download complete',
      body: 'Chapters 120–158 of Starfall Requiem are saved for offline reading.',
      createdAt: isoMinutesAgo(180),
      read: true,
      novelSlug: 'starfall-requiem',
    },
    {
      id: 'ntf-chapter-regressor',
      type: 'chapter',
      title: 'New chapter · Regressor’s Tenth Life',
      body: 'Chapter 76 “A Debt Ten Lifetimes Old” just released.',
      createdAt: isoMinutesAgo(420),
      read: false,
      novelSlug: 'regressors-tenth-life',
    },
    {
      id: 'ntf-system-streak',
      type: 'system',
      title: 'Your reading streak reached 30 days',
      body: 'You’ve opened a chapter every day this month — keep it going.',
      createdAt: isoMinutesAgo(1560),
      read: true,
    },
    {
      id: 'ntf-reply-duskmourn',
      type: 'reply',
      title: '4 new replies in Duskmourn',
      body: 'The thread on Chapter 51 is heating up while you were away.',
      createdAt: isoMinutesAgo(2880),
      read: true,
      novelSlug: 'duskmourn',
    },
    {
      id: 'ntf-system-welcome',
      type: 'system',
      title: 'Welcome to Updates',
      body: 'Chapter releases, replies and downloads you care about land here.',
      createdAt: isoMinutesAgo(7200),
      read: true,
    },
  ];
}

/** Reads this user's Updates, seeding the sample on first browser read. Returns an empty list during SSR. */
function readNotifications(userId?: string): Notification[] {
  if (typeof window === 'undefined') return [];
  const stored = readLocal<Notification[] | null>(namespacedKey(NOTIFICATIONS_STORAGE_KEY, userId), null);
  if (stored) return stored;
  const seeded = seedNotifications();
  writeNotifications(seeded, userId);
  return seeded;
}

function writeNotifications(notifications: Notification[], userId?: string): void {
  writeLocal(namespacedKey(NOTIFICATIONS_STORAGE_KEY, userId), notifications);
}

/** Drop the current user's Updates — called on sign-out so the next account starts clean. */
export function clearNotificationsMirror(userId?: string): void {
  removeLocal(namespacedKey(NOTIFICATIONS_STORAGE_KEY, userId));
}

export const notificationsQueryOptions = (userId?: string) =>
  queryOptions<Notification[], ApiError>({
    queryKey: notificationsKeys.all,
    queryFn: () => readNotifications(userId),
  });

export function useMarkAllReadMutation(userId?: string): UseMutationResult<Notification[], ApiError, void> {
  const queryClient = useQueryClient();
  return useMutation<Notification[], ApiError>({
    mutationFn: async () => {
      const next = readNotifications(userId).map(notification => (notification.read ? notification : { ...notification, read: true }));
      writeNotifications(next, userId);
      return next;
    },
    onSuccess: next => queryClient.setQueryData(notificationsKeys.all, next),
  });
}

export function useMarkReadMutation(userId?: string): UseMutationResult<Notification[], ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<Notification[], ApiError, string>({
    mutationFn: async id => {
      const next = readNotifications(userId).map(notification => (notification.id === id ? { ...notification, read: true } : notification));
      writeNotifications(next, userId);
      return next;
    },
    onSuccess: next => queryClient.setQueryData(notificationsKeys.all, next),
  });
}
