import type { IntegrationPiece } from "@pc/domain"
import type { FieldErrors } from "@/lib/forms/decode-form"
import type { ConnectDraft } from "./connect-draft"

export interface ConnectFieldsProps {
  readonly piece: IntegrationPiece
  readonly draft: ConnectDraft
  readonly set: <K extends keyof ConnectDraft>(key: K, value: ConnectDraft[K]) => void
  /** Keyed by schema path, e.g. `connection.secret`. */
  readonly errors: FieldErrors
}
