import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import type { PrismaClient } from "@prisma/client";

/**
 * ResilientSessionStorage provides zero-downtime session handling for Shopify.
 * It wraps PrismaSessionStorage as the primary persistent layer and automatically
 * falls back to an in-memory cache if the remote database is initializing, migrating,
 * or temporarily unreachable.
 */
export class ResilientSessionStorage implements SessionStorage {
  private prismaStorage: PrismaSessionStorage<PrismaClient>;
  private memorySessions = new Map<string, Session>();
  private static loggedDbWarning = false;

  constructor(prisma: PrismaClient) {
    this.prismaStorage = new PrismaSessionStorage(prisma);
  }

  async storeSession(session: Session): Promise<boolean> {
    // Always keep in memory cache for instant recovery
    this.memorySessions.set(session.id, session);

    try {
      return await this.prismaStorage.storeSession(session);
    } catch (err: any) {
      if (!ResilientSessionStorage.loggedDbWarning) {
        console.warn(
          "[ResilientSessionStorage] Database persistence unavailable; holding session in memory:",
          err?.message || err
        );
        ResilientSessionStorage.loggedDbWarning = true;
      }
      return true;
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const session = await this.prismaStorage.loadSession(id);
      if (session) {
        this.memorySessions.set(id, session);
        return session;
      }
    } catch (err: any) {
      if (!ResilientSessionStorage.loggedDbWarning) {
        console.warn(
          "[ResilientSessionStorage] Database read unavailable; reading session from memory:",
          err?.message || err
        );
        ResilientSessionStorage.loggedDbWarning = true;
      }
    }

    return this.memorySessions.get(id);
  }

  async deleteSession(id: string): Promise<boolean> {
    this.memorySessions.delete(id);
    try {
      return await this.prismaStorage.deleteSession(id);
    } catch {
      return true;
    }
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    for (const id of ids) {
      this.memorySessions.delete(id);
    }
    try {
      return await this.prismaStorage.deleteSessions(ids);
    } catch {
      return true;
    }
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const dbSessions = await this.prismaStorage.findSessionsByShop(shop);
      if (dbSessions && dbSessions.length > 0) {
        return dbSessions;
      }
    } catch (err: any) {
      // Database unavailable, fallback to memory
    }

    const matched: Session[] = [];
    for (const s of this.memorySessions.values()) {
      if (s.shop.toLowerCase() === shop.toLowerCase()) {
        matched.push(s);
      }
    }
    return matched;
  }
}
