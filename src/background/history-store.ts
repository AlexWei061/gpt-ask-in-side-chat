import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { createHistoryKey, decryptJson, encryptJson, type Ciphertext } from "./crypto";
import type { SideChatRecord } from "../shared/types";

interface HistoryDatabase extends DBSchema {
  meta: {
    key: string;
    value: CryptoKey;
  };
  histories: {
    key: string;
    value: Ciphertext;
  };
}

export class HistoryStore {
  private readonly database: Promise<IDBPDatabase<HistoryDatabase>>;
  private historyKey: Promise<CryptoKey> | undefined;

  constructor(databaseName = "side-chat-companion") {
    this.database = openDB<HistoryDatabase>(databaseName, 1, {
      upgrade(database) {
        database.createObjectStore("meta");
        database.createObjectStore("histories");
      },
    });
  }

  async get(conversationId: string): Promise<SideChatRecord | null> {
    const [database, key] = await Promise.all([this.database, this.key()]);
    const ciphertext = await database.get("histories", conversationId);
    if (!ciphertext) return null;

    const record = await decryptJson<SideChatRecord>(ciphertext, key);
    if (!isSideChatRecord(record, conversationId)) {
      throw new Error("Incompatible side-chat history record");
    }
    return record;
  }

  async put(record: SideChatRecord): Promise<void> {
    const [database, key] = await Promise.all([this.database, this.key()]);
    await database.put("histories", await encryptJson(record, key), record.conversationId);
  }

  async delete(conversationId: string): Promise<void> {
    const database = await this.database;
    await database.delete("histories", conversationId);
  }

  async clear(): Promise<void> {
    const database = await this.database;
    await database.clear("histories");
  }

  async close(): Promise<void> {
    (await this.database).close();
  }

  private key(): Promise<CryptoKey> {
    if (this.historyKey) return this.historyKey;

    const pending = this.loadOrCreateHistoryKey();
    this.historyKey = pending;
    void pending.catch(() => {
      if (this.historyKey === pending) this.historyKey = undefined;
    });
    return pending;
  }

  private async loadOrCreateHistoryKey(): Promise<CryptoKey> {
    const database = await this.database;
    const candidate = await createHistoryKey();
    const transaction = database.transaction("meta", "readwrite");
    const existing = await transaction.store.get("history-key");
    if (existing) {
      await transaction.done;
      return existing;
    }

    await transaction.store.put(candidate, "history-key");
    await transaction.done;
    return candidate;
  }
}

function isSideChatRecord(value: unknown, conversationId: string): value is SideChatRecord {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || !isNonEmptyString(value.conversationId)
    || value.conversationId !== conversationId
    || typeof value.updatedAt !== "string"
    || !Array.isArray(value.messages)) return false;

  return value.messages.every(isSideMessage);
}

function isSideMessage(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || (value.role !== "user" && value.role !== "assistant")
    || typeof value.content !== "string"
    || (value.status !== "complete" && value.status !== "incomplete")
    || typeof value.createdAt !== "string") return false;

  return value.quote === undefined || isQuoteReference(value.quote);
}

function isQuoteReference(value: unknown): boolean {
  return isRecord(value)
    && typeof value.text === "string"
    && (value.sourceRole === "user" || value.sourceRole === "assistant")
    && typeof value.sourceMessageIndex === "number"
    && Number.isInteger(value.sourceMessageIndex)
    && value.sourceMessageIndex >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
