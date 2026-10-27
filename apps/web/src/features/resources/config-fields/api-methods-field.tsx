import { ApiMethod, isSafeApiMethod } from "@pc/domain"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface ApiMethodsFieldProps {
  readonly value: ReadonlyArray<ApiMethod>
  readonly onChange: (methods: ReadonlyArray<ApiMethod>) => void
  readonly invalid: boolean
}

/** Methods agents may call, kept in the contract's order. Anything beyond GET and HEAD also needs a `write` grant. */
export function ApiMethodsField({ value, onChange, invalid }: ApiMethodsFieldProps) {
  const toggle = (method: ApiMethod, checked: boolean) =>
    onChange(ApiMethod.literals.filter((m) => (m === method ? checked : value.includes(m))))
  return (
    <div role="group" aria-label="Allowed methods" className="flex flex-wrap gap-2">
      {ApiMethod.literals.map((method) => {
        const id = `api-method-${method}`
        const checked = value.includes(method)
        return (
          <Label
            key={method}
            htmlFor={id}
            className={cn(
              "h-8 cursor-pointer gap-2 rounded-lg border px-2.5 font-mono text-xs font-normal transition-colors",
              checked ? "border-foreground/25 bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
              invalid && "border-destructive/50"
            )}
          >
            <Checkbox id={id} checked={checked} onCheckedChange={(c) => toggle(method, c === true)} />
            {method}
            {!isSafeApiMethod(method) && <span className="font-sans text-[0.6875rem] text-muted-foreground">write</span>}
          </Label>
        )
      })}
    </div>
  )
}
