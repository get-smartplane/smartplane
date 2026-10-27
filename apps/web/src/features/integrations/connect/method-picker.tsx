import type { IntegrationPiece } from "@pc/domain"
import { ChoiceCards } from "@/components/form/choice-cards"
import { methodMeta } from "../auth-methods"
import type { ConnectDraft } from "./connect-draft"

interface MethodPickerProps {
  readonly piece: IntegrationPiece
  readonly value: ConnectDraft["method"]
  readonly onChange: (method: ConnectDraft["method"]) => void
}

/** Shown only when a piece offers more than one way in (GitHub: OAuth, a GitHub App, or a token). */
export function MethodPicker({ piece, value, onChange }: MethodPickerProps) {
  if (piece.auth.length < 2) return null
  const choices = piece.auth.map((auth) => ({ value: auth.type, ...methodMeta(auth, piece.displayName) }))
  return <ChoiceCards label="Connect with" choices={choices} value={value} onChange={onChange} columns={piece.auth.length === 2 ? 2 : 3} />
}
