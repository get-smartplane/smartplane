import { agentSetupPrompt, CreatedMachineToken, SetupPlatform } from "@pc/domain"
import { Option, Schema } from "effect"
import { Flag } from "effect/cli"

export const platformFlag = Flag.Literals("platform", SetupPlatform.literals).pipe(
  Flag.withDescription("Where the service runs, for the agent prompt (default: the agent detects it)"),
  Flag.optional
)

/** `create --json`: the API's own shape plus the prompt, so scripts can hand it to an agent. */
export const CreatedWithPrompt = Schema.Struct({ ...CreatedMachineToken.fields, agentPrompt: Schema.String })

const originOf = (deliverUrl: string): string | undefined => {
  try {
    return new URL(deliverUrl).origin
  } catch {
    return undefined
  }
}

/**
 * The prompt the dashboard shows, in its "without pasting the token" form: the CLI prints the token only
 * where `create` always has (alone on stdout, or in `--json`), never inside the prompt.
 */
export const cliAgentPrompt = (created: CreatedMachineToken, platform: Option.Option<SetupPlatform>): string =>
  agentSetupPrompt({ service: created.token.name, platform: Option.getOrUndefined(platform), apiUrl: originOf(created.deliverUrl) })
