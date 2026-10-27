import { Schema } from "effect"

export const ThemePreference = Schema.Literals(["light", "dark", "system"])
export type ThemePreference = typeof ThemePreference.Type

/** Must match the inline script in index.html that applies the class before first paint. */
export const themeStorageKey = "pc-theme"

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)")

/** Storage can be unavailable (private mode, blocked site data); the theme then just isn't remembered. */
export const readThemePreference = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(themeStorageKey)
    return Schema.is(ThemePreference)(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

export const storeThemePreference = (preference: ThemePreference) => {
  try {
    window.localStorage.setItem(themeStorageKey, preference)
  } catch {
    // Not remembered across reloads; the current page still applies it.
  }
}

export const resolveTheme = (preference: ThemePreference): "light" | "dark" =>
  preference === "system" ? (darkQuery().matches ? "dark" : "light") : preference

export const applyTheme = (preference: ThemePreference) => {
  document.documentElement.classList.toggle("dark", resolveTheme(preference) === "dark")
}

export const onSystemThemeChange = (listener: () => void) => {
  const query = darkQuery()
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}
