import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  applyTheme,
  onSystemThemeChange,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  type ThemePreference
} from "./theme"
import { ThemeContext } from "./theme-context"

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference)
  const [resolved, setResolved] = useState(() => resolveTheme(preference))

  useEffect(() => {
    const sync = () => {
      applyTheme(preference)
      setResolved(resolveTheme(preference))
    }
    sync()
    storeThemePreference(preference)
    return preference === "system" ? onSystemThemeChange(sync) : undefined
  }, [preference])

  const state = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved])

  return <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>
}
