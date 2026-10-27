import { createContext, useContext } from "react"
import type { ThemePreference } from "./theme"

export interface ThemeState {
  readonly preference: ThemePreference
  readonly resolved: "light" | "dark"
  readonly setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export const useTheme = (): ThemeState => {
  const state = useContext(ThemeContext)
  if (state === null) throw new Error("useTheme must be used inside ThemeProvider")
  return state
}
