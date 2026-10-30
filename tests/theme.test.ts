import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTheme, watchTheme } from "../src/lib/theme";

afterEach(() => vi.unstubAllGlobals());

describe("device-aware appearance", () => {
  it("resolves automatic and explicit preferences", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("tracks device changes and cleans up its listener", () => {
    let onChange: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: vi.fn((_name, callback) => (onChange = callback)),
      removeEventListener: vi.fn(),
    };
    const meta = { setAttribute: vi.fn() };
    const root = { dataset: {} as Record<string, string> };
    vi.stubGlobal("window", { matchMedia: () => media });
    vi.stubGlobal("document", {
      documentElement: root,
      querySelector: () => meta,
    });

    const stop = watchTheme("system");
    expect(root.dataset.theme).toBe("light");
    expect(meta.setAttribute).toHaveBeenLastCalledWith("content", "#ffffff");
    media.matches = true;
    onChange?.();
    expect(root.dataset.theme).toBe("dark");
    expect(meta.setAttribute).toHaveBeenLastCalledWith("content", "#101010");
    stop();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", onChange);

    watchTheme("light");
    expect(root.dataset.theme).toBe("light");
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
  });

  it("supports browsers with the older media-query listener API", () => {
    let callback: (() => void) | undefined;
    const media = {
      matches: true,
      addListener: vi.fn((listener) => (callback = listener)),
      removeListener: vi.fn(),
    };
    const root = { dataset: {} as Record<string, string> };
    vi.stubGlobal("window", { matchMedia: () => media });
    vi.stubGlobal("document", {
      documentElement: root,
      querySelector: () => null,
    });
    const stop = watchTheme("system");
    expect(root.dataset.theme).toBe("dark");
    media.matches = false;
    callback?.();
    expect(root.dataset.theme).toBe("light");
    stop();
    expect(media.removeListener).toHaveBeenCalledWith(callback);
  });
});
