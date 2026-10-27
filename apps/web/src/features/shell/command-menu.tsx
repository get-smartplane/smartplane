import { useNavigate } from "@tanstack/react-router"
import { CornerDownLeft, Search } from "lucide-react"
import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useMe } from "@/features/auth/me-context"
import { cn } from "@/lib/utils"
import { commandItems, matches, type CommandItem } from "./command-items"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** ⌘K: jump to any page or start a task, by typing a few letters. */
export function CommandMenu() {
  const { principal } = useMe()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const all = useMemo(() => commandItems(principal), [principal])
  const results = useMemo(() => all.filter((item) => matches(item, query.trim())), [all, query])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const change = (next: boolean) => {
    setOpen(next)
    setQuery("")
    setActive(0)
  }
  const go = (item: CommandItem | undefined) => {
    if (item === undefined) return
    change(false)
    void navigate({ to: item.to })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((index) => (index + step + results.length) % Math.max(results.length, 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      go(results[active])
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 w-9 justify-center px-0 text-muted-foreground sm:w-56 sm:justify-start sm:px-2.5" onClick={() => change(true)}>
        <Search />
        <span className="hidden font-medium sm:inline">Search or jump to…</span>
        <kbd className="ml-auto hidden rounded-sm bg-muted px-1.5 font-sans text-[0.6875rem] text-muted-foreground sm:inline">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </Button>
      <Dialog open={open} onOpenChange={change}>
        <DialogContent showCloseButton={false} className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 data-open:animate-none data-closed:animate-none sm:max-w-lg">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Type to find a page or a task, then press Enter.</DialogDescription>
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              aria-label="Search pages and tasks"
              placeholder="Search pages and tasks…"
              className="h-12 w-full bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</li>}
            {results.map((item, index) => (
              <li key={`${item.group}-${item.label}`} role="option" aria-selected={index === active}>
                {(index === 0 || results[index - 1]?.group !== item.group) && (
                  <p className="px-2.5 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{item.group}</p>
                )}
                <button
                  type="button"
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cn("flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm", index === active && "bg-accent")}
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  {index === active && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
