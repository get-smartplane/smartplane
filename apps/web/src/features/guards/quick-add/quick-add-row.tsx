import { Plus } from "lucide-react"
import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { MaxRuleLength, ruleToAdd, splitRules } from "./split-rules"

/** More lines than this in one paste are probably not a list of rules. */
const MaxPastedRules = 30

/**
 * The "Add rule" row under the rules list. Enter (or Shift+Enter: there are no multi-line rules here, a new
 * line means the next rule) adds the typed rule and leaves the row empty and focused for the next one; an
 * empty Enter does nothing. Esc clears what is typed, or leaves the row when it is empty. Pasting several
 * lines offers to add each line as a rule. Typing is never animated: the new row simply appears above.
 */
export function QuickAddRow({ onAdd }: { readonly onAdd: (rules: ReadonlyArray<string>) => void }) {
  const [text, setText] = useState("")
  const [offer, setOffer] = useState<ReadonlyArray<string> | null>(null)
  const [said, setSaid] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const accept = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (offer !== null) accept.current?.focus()
  }, [offer])

  const add = (rules: ReadonlyArray<string>) => {
    onAdd(rules)
    setSaid(rules.length === 1 ? `Added “${rules[0]}”. Verifying it now.` : `Added ${rules.length} rules. Verifying them now.`)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Enter") {
      event.preventDefault()
      const rule = ruleToAdd(text)
      if (rule === undefined) return
      add([rule])
      setText("")
    } else if (event.key === "Escape") {
      event.preventDefault()
      if (text !== "") setText("")
      else input.current?.blur()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const rules = splitRules(event.clipboardData.getData("text"))
    if (rules.length < 2) return
    event.preventDefault()
    setOffer(rules.slice(0, MaxPastedRules))
  }

  const closeOffer = (pasteAsOne: boolean) => {
    if (pasteAsOne && offer !== null) setText((current) => `${current} ${offer.join(" ")}`.trim().slice(0, MaxRuleLength))
    setOffer(null)
    input.current?.focus()
  }

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={4} className="py-2">
        <div className="flex items-center gap-2">
          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="quick-add-rule" className="sr-only">Add rule</label>
          <input
            id="quick-add-rule"
            ref={input}
            value={text}
            maxLength={MaxRuleLength}
            autoComplete="off"
            placeholder="Add rule, e.g. “Contractors can't push to main”"
            aria-describedby="quick-add-hint"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <span id="quick-add-hint" className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            <kbd className="font-sans font-medium">Enter</kbd> adds and verifies · <kbd className="font-sans font-medium">Esc</kbd> clears
          </span>
        </div>
        {offer !== null && (
          <div
            className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2.5 pl-8 text-sm"
            role="group"
            aria-label="Add pasted lines"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                closeOffer(false)
              }
            }}
          >
            <span className="mr-auto min-w-0 flex-1 basis-60">
              Add these {offer.length} lines as {offer.length} rules?
              <span className="block truncate text-xs text-muted-foreground">{offer.map((rule) => `“${rule}”`).join(" · ")}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Button ref={accept} size="sm" onClick={() => {
                add(offer)
                closeOffer(false)
              }}>
                Add {offer.length} rules
              </Button>
              <Button size="sm" variant="ghost" onClick={() => closeOffer(true)}>Paste as one rule</Button>
            </span>
          </div>
        )}
        <p className="sr-only" aria-live="polite">{said}</p>
      </TableCell>
    </TableRow>
  )
}
