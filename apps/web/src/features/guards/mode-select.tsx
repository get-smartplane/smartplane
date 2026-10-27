import { GuardMode } from "@pc/domain"
import { ChoiceCards } from "@/components/form/choice-cards"
import { modeMeta } from "./guard-meta"

const choices = GuardMode.literals.map((mode) => ({ value: mode, label: modeMeta[mode].label, description: modeMeta[mode].description }))

/** What happens when a call breaks the rule. */
export function ModeSelect({ id, value, onChange, stacked }: { readonly id: string; readonly value: GuardMode; readonly onChange: (mode: GuardMode) => void; readonly stacked?: boolean }) {
  return <ChoiceCards id={id} label="When broken" choices={choices} value={value} onChange={onChange} columns={stacked ? 1 : 3} />
}
