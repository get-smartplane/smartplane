import { AuthFailed, UnsupportedAction, UpstreamError } from "@pc/integrations/rpc"
import { Option, Schema } from "effect"

/** pieces-common's HttpError and axios errors both expose `response.status`. */
const HttpFailure = Schema.Struct({ response: Schema.Struct({ status: Schema.Int }) })
const statusOf = (error: unknown): number | null =>
  Option.match(Schema.decodeUnknownOption(HttpFailure)(error), { onNone: () => null, onSome: ({ response }) => response.status })

const MaxMessage = 2_000

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : typeof error === "string" ? error : "the action failed")

/**
 * Turns whatever a piece threw into a typed failure. Messages are scrubbed of credentials and capped:
 * pieces often embed request or response details in them.
 */
export const failureOf = (error: unknown, scrub: (text: string) => string): UnsupportedAction | AuthFailed | UpstreamError => {
  if (error instanceof UnsupportedAction) return error
  const status = statusOf(error)
  const message = scrub(messageOf(error)).slice(0, MaxMessage)
  if (status === 401) return new AuthFailed({ message })
  return new UpstreamError({ message, status })
}
