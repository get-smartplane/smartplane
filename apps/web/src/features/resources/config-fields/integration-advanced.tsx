import { PieceId } from "@pc/domain"
import { Option, Schema } from "effect"
import { FormField } from "@/components/form/form-field"
import { useQueryData } from "@/components/query/use-query-data"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { isOffered } from "@/features/integrations/actions/action-groups"
import { ActionsPicker } from "@/features/integrations/actions/actions-picker"
import { pieceAtom } from "@/features/integrations/atoms"
import type { ConfigFieldsProps } from "../config-draft"

const decodePieceId = Schema.decodeUnknownOption(PieceId)

function ActionsField({ pieceId, draft, set, errors }: ConfigFieldsProps & { readonly pieceId: PieceId }) {
  const offered = useQueryData(pieceAtom(pieceId), null)?.actions.filter(isOffered) ?? []
  const limit = (on: boolean) => {
    set("limitActions", on)
    if (on && draft.actions.length === 0) set("actions", offered.map((action) => action.name))
  }
  return (
    <>
      <Field orientation="horizontal">
        <Switch id="integration-limit" checked={draft.limitActions} onCheckedChange={limit} />
        <FieldContent>
          <FieldLabel htmlFor="integration-limit">Only offer some actions</FieldLabel>
          <FieldDescription>Without a list, every supported action is offered; grants still decide who may call them.</FieldDescription>
        </FieldContent>
      </Field>
      {draft.limitActions && (
        <FormField id="integration-actions" label="Offered actions" error={errors["config.actions"] && "Choose at least one action."}>
          <ActionsPicker id="integration-actions" actions={offered} value={draft.actions} onChange={(names) => set("actions", names)} invalid={errors["config.actions"] !== undefined} />
        </FormField>
      )}
    </>
  )
}

/** The action allow-list, once a piece is chosen. */
export function IntegrationAdvanced(props: ConfigFieldsProps) {
  return Option.match(decodePieceId(props.draft.pieceId), {
    onNone: () => <p className="text-xs text-muted-foreground">Choose an integration to limit which of its actions it offers.</p>,
    onSome: (pieceId) => <ActionsField pieceId={pieceId} {...props} />
  })
}
