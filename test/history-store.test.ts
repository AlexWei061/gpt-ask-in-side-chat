import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "vitest";
import { HistoryStore } from "../src/background/history-store";
import type { SideChatRecord } from "../src/shared/types";

const databaseNames: string[] = [];

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

function createStore(): HistoryStore {
  const databaseName = `history-store-${crypto.randomUUID()}`;
  databaseNames.push(databaseName);
  return new HistoryStore(databaseName);
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((databaseName) => indexedDB.deleteDatabase(databaseName)));
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
});
