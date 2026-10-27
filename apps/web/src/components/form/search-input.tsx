import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SearchInputProps {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly className?: string
}

/** Filters a list already on screen as you type. */
export function SearchInput({ label, value, onChange, className }: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" aria-label={label} placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} className="pl-8" />
    </div>
  )
}

/** Case-insensitive match of every word in `query` against any of `fields`. */
export const matchesQuery = (query: string, fields: ReadonlyArray<string | null>): boolean => {
  const haystack = fields.filter((field) => field !== null).join(" ").toLowerCase()
  return query.trim().toLowerCase().split(/\s+/).every((word) => haystack.includes(word))
}
