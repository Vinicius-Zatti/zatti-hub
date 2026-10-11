import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hashSenhaTemporaria, recusaDefinitivaDoAuth } = await import("./servidor");

describe("recusaDefinitivaDoAuth", () => {
  it("só 4xx libera a trava; rede, tempo esgotado e 5xx ficam indeterminados", () => {
    expect(recusaDefinitivaDoAuth({ status: 422 })).toBe(true);
    expect(recusaDefinitivaDoAuth({ status: 400 })).toBe(true);
    expect(recusaDefinitivaDoAuth({ status: 500 })).toBe(false);
    expect(recusaDefinitivaDoAuth({ status: 0 })).toBe(false);
    expect(recusaDefinitivaDoAuth({})).toBe(false);
    expect(recusaDefinitivaDoAuth(null)).toBe(false);
  });
});

describe("hashSenhaTemporaria", () => {
  it("depende da pessoa e da senha", () => {
    expect(hashSenhaTemporaria("u1", "abc")).toBe(hashSenhaTemporaria("u1", "abc"));
    expect(hashSenhaTemporaria("u1", "abc")).not.toBe(hashSenhaTemporaria("u2", "abc"));
  });
});
