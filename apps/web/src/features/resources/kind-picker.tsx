import { ResourceKind } from "@pc/domain"
import { ChoiceCards } from "@/components/form/choice-cards"
import { kindMeta } from "./kinds"

const allChoices = ResourceKind.literals.map((kind) => ({ value: kind, label: kindMeta[kind].label, icon: kindMeta[kind].icon }))

/** Every offered kind at once, so choosing one is a single click. */
export function KindPicker({ value, onChange, kinds }: { readonly value: ResourceKind; readonly onChange: (kind: ResourceKind) => void; readonly kinds?: ReadonlyArray<ResourceKind> }) {
  const choices = kinds === undefined ? allChoices : allChoices.filter((choice) => kinds.includes(choice.value))
  return <ChoiceCards label="Kind" choices={choices} value={value} onChange={onChange} columns={kinds !== undefined && kinds.length <= 6 ? 3 : 4} />
}
