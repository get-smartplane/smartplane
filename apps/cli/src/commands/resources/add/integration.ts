import { ActionName, type IntegrationAuthType, type IntegrationConnectionInput, PieceId } from "@pc/domain"
import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"
import { api, type Api } from "../../../api/client"
import { field } from "../../../app/common-flags"
import { usageFailure } from "../../../app/failure"
import { CommaList } from "../../../app/flag-values"
import { note } from "../../../app/output"
import { commonFlags, createResource, optionalSecret, secretRef } from "./common"

const authChoices = [["none", "none"], ["secret-text", "secret_text"], ["basic", "basic"], ["custom", "custom"], ["oauth2", "oauth2"]] as const

const flags = {
  ...commonFlags,
  piece: Flag.String("piece").pipe(Flag.withSchema(PieceId), Flag.withDescription("Catalog piece id, e.g. github (see `integrations ls`)")),
  actions: Flag.String("actions").pipe(Flag.withSchema(CommaList(ActionName)), Flag.withDescription("Only these actions (default: every supported one)"), Flag.optional),
  auth: Flag.ChoiceWithValue("auth", authChoices).pipe(Flag.withDescription("Connection method (default: the piece's first)"), Flag.optional),
  secret: secretRef("secret", "Credential for secret-text, basic or custom auth").pipe(Flag.optional),
  clientId: Flag.String("client-id").pipe(Flag.withDescription("OAuth2 app client id"), Flag.optional),
  clientSecret: secretRef("client-secret", "OAuth2 app client secret").pipe(Flag.optional),
  prop: Flag.KeyValuePair("prop").pipe(Flag.withDescription("Non-secret OAuth2 field, e.g. subdomain=acme"), Flag.optional)
}

type Input = Command.Command.Config.Infer<typeof flags>

const connectionFor = (client: Api, auth: IntegrationAuthType, input: Input) =>
  Effect.gen(function*() {
    const secret = yield* optionalSecret(client, input.secret)
    switch (auth) {
      case "none":
        return { type: "none" } satisfies IntegrationConnectionInput
      case "oauth2": {
        const clientSecretId = yield* optionalSecret(client, input.clientSecret)
        if (Option.isNone(input.clientId) || Option.isNone(clientSecretId)) {
          return yield* usageFailure("OAuth2 needs --client-id and --client-secret.")
        }
        return { type: "oauth2", clientId: input.clientId.value, clientSecretId: clientSecretId.value, ...field("props", input.prop) } satisfies IntegrationConnectionInput
      }
      default:
        if (Option.isNone(secret)) return yield* usageFailure(`${auth.replace("_", "-")} auth needs --secret.`)
        return { type: auth, secretId: secret.value } satisfies IntegrationConnectionInput
    }
  })

export const addIntegration = Command.make("integration", flags, (input) =>
  Effect.gen(function*() {
    const client = yield* api
    const auth = Option.isSome(input.auth)
      ? input.auth.value
      : (yield* client.integrations.getPiece({ params: { pieceId: input.piece } })).authTypes[0] ?? "none"
    const connection = yield* connectionFor(client, auth, input)
    const resource = yield* createResource(client, input, { kind: "integration", pieceId: input.piece, ...field("actions", input.actions), connection })
    if (connection.type === "oauth2") {
      const { authorizeUrl } = yield* client.integrations.startOAuth({ params: { id: resource.id }, query: {} })
      yield* note(`Authorize the connection in a browser: ${authorizeUrl}`)
    }
  })).pipe(
    Command.withDescription("Add a catalog integration (Activepieces piece) run by Smartplane"),
    Command.withExamples([
      { command: "smartplane resources add integration --name github --piece github --auth secret-text --secret github-pat", description: "GitHub with a personal access token" }
    ])
  )
