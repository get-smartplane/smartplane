import { HttpApiMiddleware, HttpApiSecurity } from "effect/http-api"
import { CurrentDeliveryCaller } from "../access/machine-token"
import { Unauthorized } from "../errors"
import { CurrentPrincipal, CurrentUser } from "../principal"

/** Sealed WorkOS session cookie set by the browser auth routes in apps/api. */
export const SessionCookie = "pc_session"

const session = HttpApiSecurity.apiKey({ key: SessionCookie, in: "cookie" })

/**
 * Org-scoped authentication. Schemes are tried in order: the dashboard session cookie, then a
 * bearer access token for API clients. A handler must fail with Unauthorized on an empty credential
 * so the next scheme gets its turn.
 */
export class Authentication extends HttpApiMiddleware.Service<Authentication, { provides: CurrentPrincipal }>()(
  "@pc/domain/Authentication",
  { error: Unauthorized, security: { session, bearer: HttpApiSecurity.bearer } }
) {}

/** Session-only authentication that does not require an org; used to create the first one. */
export class SessionAuthentication extends HttpApiMiddleware.Service<SessionAuthentication, { provides: CurrentUser }>()(
  "@pc/domain/SessionAuthentication",
  { error: Unauthorized, security: { session } }
) {}

/**
 * The only scheme that accepts machine tokens (`pcm_`), and only `POST /api/secrets/deliver` uses it. Also
 * accepts personal tokens (`pc_`) and AuthKit access tokens. Bearer only: no session cookie, so a browser
 * page can never make a dashboard user's session fetch secret values.
 */
export class DeliveryAuthentication extends HttpApiMiddleware.Service<DeliveryAuthentication, { provides: CurrentDeliveryCaller }>()(
  "@pc/domain/DeliveryAuthentication",
  { error: Unauthorized, security: { bearer: HttpApiSecurity.bearer } }
) {}
