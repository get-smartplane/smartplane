import { AuditEventType } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { Schema } from "effect"
import { SlidersHorizontal, X } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AuditSearch } from "./audit-search"
import { eventLabel } from "./event-label"
import { quickViews } from "./quick-views"

const allTypes = "all"
const isEventType = Schema.is(AuditEventType)
const nonEmpty = (value: string) => (value.trim() === "" ? undefined : value.trim())
const chip = (active: boolean) =>
  cn(
    "inline-flex h-7 items-center rounded-[3px] px-2.5 text-[0.8125rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    active ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
  )

/** Quick views for the common questions; any event type, actor or target behind "Filters". */
export function AuditFilters({ search }: { readonly search: AuditSearch }) {
  const navigate = useNavigate({ from: "/audit" })
  const [actorId, setActorId] = useState(search.actorId ?? "")
  const [targetId, setTargetId] = useState(search.targetId ?? "")
  const [open, setOpen] = useState(search.actorId !== undefined || search.targetId !== undefined)
  const apply = (next: AuditSearch) => void navigate({ search: next })
  const filtered = search.type !== undefined || search.actorId !== undefined || search.targetId !== undefined

  const submit = (event: FormEvent) => {
    event.preventDefault()
    apply({ ...search, actorId: nonEmpty(actorId), targetId: nonEmpty(targetId) })
  }
  const clear = () => {
    setActorId("")
    setTargetId("")
    apply({})
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Quick views" className="-mx-4 flex overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="inline-flex gap-0.5 rounded-md bg-muted p-0.5">
            {quickViews.map((view) => (
              <button key={view.label} type="button" aria-pressed={search.type === view.type} className={chip(search.type === view.type)} onClick={() => apply({ ...search, type: view.type })}>
                {view.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {filtered && (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <X />
              Clear
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            <SlidersHorizontal />
            Filters
          </Button>
        </div>
      </div>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg bg-muted/55 p-2.5 md:flex-row md:items-center">
          <Select value={search.type ?? allTypes} onValueChange={(value) => apply({ ...search, type: isEventType(value) ? value : undefined })}>
            <SelectTrigger className="w-full md:w-56" aria-label="Event type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allTypes}>Any event type</SelectItem>
              {AuditEventType.literals.map((type) => (
                <SelectItem key={type} value={type}>
                  {eventLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input aria-label="Actor id" placeholder="Who: usr_… or tok_…" value={actorId} onChange={(e) => setActorId(e.target.value)} className="md:w-52" />
          <Input aria-label="Target id" placeholder="What: any id" value={targetId} onChange={(e) => setTargetId(e.target.value)} className="md:w-44" />
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      )}
    </div>
  )
}
