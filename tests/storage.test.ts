import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("browser preference storage", () => {
  it("keeps the interface usable when browser storage is blocked", async () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new DOMException("Access denied", "SecurityError");
      },
    });
    const { browserStorage } = await import("../src/lib/storage");
    expect(browserStorage.get("cycle")).toBeNull();
    browserStorage.set("cycle", "november");
    expect(browserStorage.get("cycle")).toBe("november");
    browserStorage.remove("cycle");
    expect(browserStorage.get("cycle")).toBeNull();
  });

  it("uses persistent storage when it is available", async () => {
    const items = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
        removeItem: (key: string) => items.delete(key),
      },
    });
    const { browserStorage } = await import("../src/lib/storage");
    browserStorage.set("cycle", "december");
    expect(items.get("cycle")).toBe("december");
    expect(browserStorage.get("cycle")).toBe("december");
    browserStorage.remove("cycle");
    expect(browserStorage.get("cycle")).toBeNull();
  });
});
