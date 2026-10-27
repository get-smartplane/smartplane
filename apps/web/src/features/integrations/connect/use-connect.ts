import type { IntegrationPiece, OAuthReturnTo, OAuthStart, Resource } from "@pc/domain"
import { toast } from "sonner"
import { createResourceAtom, removeResourceAtom } from "@/features/resources/atoms"
import { TransportFailure, type ApiError } from "@/lib/api/errors"
import type { Outcome } from "@/lib/api/outcome"
import { useMutation } from "@/lib/api/use-mutation"
import type { FormMutation } from "@/lib/forms/use-form"
import { startOAuthAtom } from "../atoms"
import type { ConnectInput } from "./connect-schema"
import { connectionInput, credentialName, credentialOf } from "./credential"

export interface Connected {
  readonly resource: Resource
  /** Set for OAuth2: where the browser goes next to sign in at the provider. */
  readonly authorizeUrl: OAuthStart["authorizeUrl"] | null
}

const failure = (error: ApiError): Outcome<Connected, ApiError> => ({ _tag: "Failure", error })

/**
 * Stores the credential as a secret resource, then the integration that references it, then (OAuth2) starts
 * sign-in. If the integration is refused, the just-created secret is removed so no orphan credential stays.
 * `returnTo` brings the browser back to that page after the provider's consent screen.
 */
export const useConnect = (piece: IntegrationPiece, returnTo?: OAuthReturnTo): FormMutation<ConnectInput, Connected, ApiError> => {
  const create = useMutation(createResourceAtom)
  const remove = useMutation(removeResourceAtom, { quiet: true })
  const start = useMutation(startOAuthAtom)

  const execute = async (input: ConnectInput): Promise<Outcome<Connected, ApiError>> => {
    const { connection, actions, ...common } = input
    const value = credentialOf(connection)
    const stored = value === null ? null : await create.execute({ ...common, name: credentialName(input.name, connection), description: `Credential for the ${input.name} integration.`, config: { kind: "secret", value } })
    if (stored?._tag === "Failure") return stored
    const storedId = stored?.value.id ?? null
    const reference = connectionInput(connection, storedId)
    if (reference === null) return failure(new TransportFailure({ message: "The credential could not be stored." }))
    const created = await create.execute({ ...common, config: { kind: "integration", pieceId: piece.id, connection: reference, ...(actions ? { actions } : {}) } })
    if (created._tag === "Failure") {
      // The integration's own error is toasted by the form; only a failed cleanup needs its own words.
      if (storedId !== null && (await remove.execute(storedId))._tag === "Failure") {
        toast.warning("The credential was stored but not used", { description: `Delete "${credentialName(input.name, connection)}" under Secrets & variables, or reuse it.` })
      }
      return created
    }
    const resource = created.value
    if (reference.type !== "oauth2") return { _tag: "Success", value: { resource, authorizeUrl: null } }
    // The integration exists either way; a failed start leaves it "not connected", to retry from its page.
    const started = await start.execute({ id: resource.id, ...(returnTo === undefined ? {} : { returnTo }) })
    return { _tag: "Success", value: { resource, authorizeUrl: started._tag === "Success" ? started.value.authorizeUrl : null } }
  }

  return { execute, pending: create.pending || remove.pending || start.pending }
}
