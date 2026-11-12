import type { Unauthorized } from "@pc/domain"
import type { ApiError } from "./errors"

/**
 * Only a rejected session sends the user to sign in. Anything else, including the identity provider being
 * unreachable (`UpstreamFailure`, 502), is shown in place with a retry, so an outage logs nobody out.
 */
export const signInRequired = (error: ApiError): error is Unauthorized => error._tag === "Unauthorized"
