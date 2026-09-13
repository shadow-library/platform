export interface BotActor {
  userId: bigint;
  ip?: string;
}

export interface BotUserRef {
  id: bigint;
  displayName: string | null;
}
