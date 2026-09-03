import "fake-indexeddb/auto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { deleteDB, openDB } from "idb";
import { encryptJson } from "../src/background/crypto";
import { HistoryStore } from "../src/background/history-store";
import type { SideChatRecord } from "../src/shared/types";

const databaseNames: string[] = [];
const stores: HistoryStore[] = [];

function record(conversationId: string, content: string): SideChatRecord {
  return {
    schemaVersion: 1,
    conversationId,
    messages: [{
      id: `${conversationId}-assistant-1`,
      role: "assistant",
      content,
      status: "complete",
      createdAt: "2026-09-03T00:00:00.000Z",
    }],
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

function createDatabaseName(): string {
  const databaseName = `history-store-${crypto.randomUUID()}`;
  databaseNames.push(databaseName);
  return databaseName;
}

function createStore(databaseName = createDatabaseName()): HistoryStore {
  const store = new HistoryStore(databaseName);
  stores.push(store);
  return store;
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(databaseNames.splice(0).map((databaseName) => deleteDB(databaseName)));
});

describe("HistoryStore", () => {
  test("round-trips encrypted records independently by conversation", async () => {
    const store = createStore();
    const a = record("a", "Alpha answer");
    const b = record("b", "Beta answer");

    await store.put(a);
    await store.put(b);

    await expect(store.get("a")).resolves.toEqual(a);
    await expect(store.get("b")).resolves.toEqual(b);
  });

  test("deletes only the requested conversation", async () => {
    const store = createStore();
    const a = record("a", "Alpha answer");
    const b = record("b", "Beta answer");

    await store.put(a);
    await store.put(b);
    await store.delete("a");

    await expect(store.get("a")).resolves.toBeNull();
    await expect(store.get("b")).resolves.toEqual(b);
  });

  test("clears histories without preventing later reads and writes", async () => {
    const store = createStore();
    const a = record("a", "Alpha answer");
    const b = record("b", "Beta answer");

    await store.put(a);
    await store.clear();
    await store.put(b);

    await expect(store.get("a")).resolves.toBeNull();
    await expect(store.get("b")).resolves.toEqual(b);
  });

  test("keeps concurrent first writes decryptable after reopening", async () => {
    const databaseName = createDatabaseName();
    const first = createStore(databaseName);
    const second = createStore(databaseName);
    const a = record("a", "Alpha answer");
    const b = record("b", "Beta answer");

    await Promise.all([first.put(a), second.put(b)]);
    await Promise.all([first.close(), second.close()]);

    const reopened = createStore(databaseName);
    await expect(reopened.get("a")).resolves.toEqual(a);
    await expect(reopened.get("b")).resolves.toEqual(b);
  });

  test("retries key initialization after a failed attempt", async () => {
    const store = createStore();
    const generateKey = vi.spyOn(crypto.subtle, "generateKey").mockRejectedValueOnce(new Error("key generation failed"));

    await expect(store.put(record("a", "Alpha answer"))).rejects.toThrow("key generation failed");
    generateKey.mockRestore();

    await expect(store.put(record("a", "Alpha answer"))).resolves.toBeUndefined();
    await expect(store.get("a")).resolves.toEqual(record("a", "Alpha answer"));
  });

  test("rejects a stored record with an incompatible schema version", async () => {
    const databaseName = createDatabaseName();
    const store = createStore(databaseName);
    await store.put(record("valid", "Valid answer"));
    const database = await openDB(databaseName);
    const key = await database.get("meta", "history-key") as CryptoKey;
    await database.put("histories", await encryptJson({ ...record("bad", "Bad answer"), schemaVersion: 2 }, key), "bad");
    database.close();

    await expect(store.get("bad")).rejects.toThrow("Incompatible side-chat history record");
  });

  test("rejects a stored record whose conversation does not match its key", async () => {
    const databaseName = createDatabaseName();
    const store = createStore(databaseName);
    await store.put(record("valid", "Valid answer"));
    const database = await openDB(databaseName);
    const key = await database.get("meta", "history-key") as CryptoKey;
    await database.put("histories", await encryptJson(record("other", "Other answer"), key), "expected");
    database.close();

    await expect(store.get("expected")).rejects.toThrow("Incompatible side-chat history record");
  });
});
