import { Action } from "@pc/domain"
import { ChoiceCards } from "@/components/form/choice-cards"
import { actionMeta } from "./action-meta"

const choices = Action.literals.map((action) => ({ value: action, ...actionMeta[action] }))

/** The four levels side by side; each includes the ones to its left. */
export function ActionPicker({ value, onChange }: { readonly value: Action; readonly onChange: (action: Action) => void }) {
  return <ChoiceCards id="grant-action" label="Level" choices={choices} value={value} onChange={onChange} columns={4} />
}
