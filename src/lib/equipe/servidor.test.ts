import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hashSenhaTemporaria } = await import("./servidor");

describe("hashSenhaTemporaria", () => {
  it("depende da pessoa e da senha", () => {
    expect(hashSenhaTemporaria("u1", "abc")).toBe(hashSenhaTemporaria("u1", "abc"));
    expect(hashSenhaTemporaria("u1", "abc")).not.toBe(hashSenhaTemporaria("u2", "abc"));
    // Mesmo valor que o banco calcula em equipe_hash_provisoria (sha256 hex de "id:senha").
    expect(hashSenhaTemporaria("00000000-0000-0000-0000-000000000001", "abcDEF234xyz")).toMatch(/^[0-9a-f]{64}$/);
  });
});
