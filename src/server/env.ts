import type { SessionUser } from '../shared/types';

export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  AI_FEATURES?: string;
}

export interface AppVariables {
  user: SessionUser;
  householdId: string;
  role: 'owner' | 'member';
}

export type AppBindings = { Bindings: Env; Variables: AppVariables };

/** AI/Vectorize bị tắt khi dev cục bộ (miniflare không mô phỏng được hai binding này). */
export function aiEnabled(env: Env): boolean {
  return env.AI_FEATURES !== 'off' && Boolean(env.AI) && Boolean(env.VECTORIZE);
}
