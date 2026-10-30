import type { ThemePreference } from "../types";

export type ResolvedTheme = "dark" | "light";

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  return preference === "system"
    ? prefersDark
      ? "dark"
      : "light"
    : preference;
}

/** Apply the saved preference and follow device changes while System is selected. */
export function watchTheme(preference: ThemePreference): () => void {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const apply = () => {
    const resolved = resolveTheme(preference, media?.matches ?? false);
    document.documentElement.dataset.theme = resolved;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolved === "dark" ? "#101010" : "#ffffff");
  };
  apply();
  if (preference !== "system" || !media) return () => {};
  if (media.addEventListener) {
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }
  // Older mobile browsers only support the legacy MediaQueryList API.
  media.addListener(apply);
  return () => media.removeListener(apply);
}
