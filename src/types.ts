export interface Avatar {
  id: string;
  emoji: string;
  color: string;
}

export interface Player {
  id: string;
  name: string;
  avatar: Avatar;
  role: string;
  alive: boolean;
  isBot?: boolean;
  isHost?: boolean;
  usedHeal?: boolean;
  usedPoison?: boolean;
}

export interface RoleInfo {
  name: string;
  team: 'werewolf' | 'villager';
  alliesText: string;
  description: string;
  icon: string;
  color: string;
  borderColor: string;
  badgeColor: string;
}

export type GamePhase = 'LOGIN' | 'STORY' | 'MENU' | 'SETUP' | 'MULTI_LOBBY' | 'WAITING_ROOM' | 'BATTLEFIELD' | 'GAME_OVER';
export type DayPhase = 'NIGHT_INTRO' | 'NIGHT_SEER' | 'NIGHT_WEREWOLF' | 'NIGHT_WITCH' | 'DAY_ANNOUNCE' | 'DAY_DISCUSS' | 'DAY_VOTE';

export interface ChatMessage {
  sender: string;
  text: string;
  type?: 'log' | 'chat';
  color?: string;
}
