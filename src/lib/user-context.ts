import { AsyncLocalStorage } from "node:async_hooks";

export interface UserContext {
  userId: string;
}

export const userStorage = new AsyncLocalStorage<UserContext>();

export function getUserId(): string | null {
  return userStorage.getStore()?.userId ?? null;
}
