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
  private historyKey?: Promise<CryptoKey>;

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
    return ciphertext ? decryptJson<SideChatRecord>(ciphertext, key) : null;
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

  private key(): Promise<CryptoKey> {
    this.historyKey ??= this.loadOrCreateHistoryKey();
    return this.historyKey;
  }

  private async loadOrCreateHistoryKey(): Promise<CryptoKey> {
    const database = await this.database;
    const existing = await database.get("meta", "history-key");
    if (existing) return existing;

    const key = await createHistoryKey();
    await database.put("meta", key, "history-key");
    return key;
  }
}
