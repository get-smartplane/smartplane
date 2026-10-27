import type { AuthField } from "@pc/domain"
import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

interface AuthFieldInputProps {
  readonly field: AuthField
  /** Form path prefix, e.g. `connection.fields`. */
  readonly path: string
  readonly value: string | boolean | undefined
  readonly onChange: (value: string | boolean) => void
  readonly error: string | undefined
}

/** Keys and service-account files span lines; a password input would silently strip the newlines. */
const isMultiline = (field: AuthField) => field.kind === "long_text" || /pem|private key|json|certificate/i.test(`${field.displayName} ${field.description ?? ""}`)

/** One field a piece declares for its connection form, rendered by its kind. */
export function AuthFieldInput({ field, path, value, onChange, error }: AuthFieldInputProps) {
  const id = `${path}.${field.name}`
  const text = typeof value === "string" ? value : ""
  const label = field.required ? field.displayName : `${field.displayName} (optional)`
  const masked = field.kind === "secret"
  const control = () => {
    if (field.kind === "checkbox") return <Switch id={id} checked={value === true} onCheckedChange={onChange} />
    if (field.kind === "select")
      return (
        <Select value={text} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full" aria-invalid={error !== undefined}>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    if (isMultiline(field))
      return (
        <Textarea
          id={id}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          className={masked ? "font-mono text-xs [-webkit-text-security:disc]" : "font-mono text-xs"}
          value={text}
          aria-invalid={error !== undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    return (
      <Input
        id={id}
        type={masked ? "password" : field.kind === "number" ? "number" : "text"}
        autoComplete="off"
        spellCheck={false}
        value={text}
        aria-invalid={error !== undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return (
    <FormField id={id} label={label} error={error} description={field.description && <span className="line-clamp-3">{field.description}</span>}>
      {control()}
    </FormField>
  )
}
