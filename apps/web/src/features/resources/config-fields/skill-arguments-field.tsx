import { Plus, X } from "lucide-react"
import { FormField } from "@/components/form/form-field"
import { RowAction } from "@/components/form/row-action"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ConfigFieldsProps, SkillArgumentDraft } from "../config-draft"

const newRow = (rows: ReadonlyArray<SkillArgumentDraft>): SkillArgumentDraft => ({
  key: Math.max(0, ...rows.map((row) => row.key)) + 1,
  name: "",
  description: "",
  required: false
})

function ArgumentRow({ row, onChange, onRemove }: {
  readonly row: SkillArgumentDraft
  readonly onChange: (row: SkillArgumentDraft) => void
  readonly onRemove: () => void
}) {
  const id = `skill-arg-${row.key}`
  return (
    <li className="grid items-center gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto_auto]">
      <Input id={`${id}-name`} aria-label="Argument name" className="font-mono" placeholder="version" value={row.name} onChange={(event) => onChange({ ...row, name: event.target.value.trim() })} />
      <Input aria-label="Argument description" placeholder="What to pass, e.g. the release tag" value={row.description} onChange={(event) => onChange({ ...row, description: event.target.value })} />
      <div className="flex items-center gap-1.5">
        <Checkbox id={`${id}-required`} checked={row.required} onCheckedChange={(checked) => onChange({ ...row, required: checked === true })} />
        <Label htmlFor={`${id}-required`} className="text-xs">Required</Label>
      </div>
      <RowAction label="Remove argument" danger onClick={onRemove}>
        <X />
      </RowAction>
    </li>
  )
}

/** Prompt arguments: clients ask for them when the skill runs as a slash command, then fill `{{name}}`. */
export function SkillAdvanced({ draft, set, errors }: ConfigFieldsProps) {
  const rows = draft.skillArguments
  const update = (next: ReadonlyArray<SkillArgumentDraft>) => set("skillArguments", next)
  return (
    <FormField
      id="skill-arguments-add"
      label="Arguments"
      error={errors["config.arguments"] && "Names start with a letter or _, use letters, digits, _ and -, and must differ."}
      description={<>Each argument fills its <code>{"{{name}}"}</code> placeholders in the instructions; write <code>{"\\{{name}}"}</code> to keep one literally.</>}
    >
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <ArgumentRow
              key={row.key}
              row={row}
              onChange={(next) => update(rows.map((candidate) => (candidate.key === row.key ? next : candidate)))}
              onRemove={() => update(rows.filter((candidate) => candidate.key !== row.key))}
            />
          ))}
        </ul>
      )}
      <Button id="skill-arguments-add" type="button" variant="outline" size="sm" className="w-fit" onClick={() => update([...rows, newRow(rows)])}>
        <Plus />
        Add an argument
      </Button>
    </FormField>
  )
}
