import { Email } from "@pc/domain"
import { Schema } from "effect"
import { X } from "lucide-react"
import { useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

export const isEmail = Schema.is(Email)

/** Adds the addresses in `text` (split on spaces, commas, semicolons, new lines), skipping repeats. */
export const withEmails = (emails: ReadonlyArray<string>, text: string): ReadonlyArray<string> => {
  const seen = new Set(emails.map((email) => email.toLowerCase()))
  const added = text.split(/[\s,;]+/).filter((email) => email !== "" && !seen.has(email.toLowerCase()) && seen.add(email.toLowerCase()))
  return [...emails, ...added]
}

interface EmailsFieldProps {
  readonly id: string
  readonly emails: ReadonlyArray<string>
  readonly onChange: (emails: ReadonlyArray<string>) => void
  readonly invalid?: boolean
}

/** Type or paste one address or many; each becomes a chip, and a typo shows on its own chip. */
export function EmailsField({ id, emails, onChange, invalid }: EmailsFieldProps) {
  const [draft, setDraft] = useState("")
  const commit = (text: string) => {
    if (text.trim() !== "") onChange(withEmails(emails, text))
    setDraft("")
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", " ", ";"].includes(event.key) && draft.trim() !== "") {
      event.preventDefault()
      commit(draft)
    } else if (event.key === "Backspace" && draft === "" && emails.length > 0) {
      onChange(emails.slice(0, -1))
    }
  }
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    commit(draft + event.clipboardData.getData("text"))
  }
  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-3 ring-destructive/20"
      )}
    >
      {emails.map((email) => {
        const valid = isEmail(email)
        return (
          <span
            key={email}
            title={valid ? undefined : "Not an email address"}
            className={cn("inline-flex h-6 items-center gap-1 rounded-sm pr-1 pl-2 text-sm", valid ? "bg-secondary text-foreground" : "bg-destructive/10 text-danger-ink")}
          >
            {email}
            <button type="button" aria-label={`Remove ${email}`} className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground" onClick={() => onChange(emails.filter((other) => other !== email))}>
              <X className="size-3" />
            </button>
          </span>
        )
      })}
      <input
        id={id}
        type="text"
        inputMode="email"
        autoComplete="off"
        autoFocus
        aria-invalid={invalid}
        placeholder={emails.length === 0 ? "ada@example.com, grace@example.com" : "Add another"}
        className="h-6 min-w-40 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => commit(draft)}
      />
    </div>
  )
}
