import { Schema } from "effect"

/** Where a machine token's service runs; the dashboard's setup tabs and `machine-tokens create --platform`. */
export const SetupPlatform = Schema.Literals(["railway", "vercel", "cloudflare-workers", "fly", "docker"])
export type SetupPlatform = typeof SetupPlatform.Type

export const setupPlatformLabels: Readonly<Record<SetupPlatform, string>> = {
  railway: "Railway",
  vercel: "Vercel",
  "cloudflare-workers": "Cloudflare Workers",
  fly: "Fly.io",
  docker: "Docker"
}

/** The hosted Smartplane; the CLI and SDK default to it, so only another deployment is named in a prompt. */
export const DefaultSmartplaneApiUrl = "https://app.smartplane.dev"

export interface AgentPromptInput {
  readonly service: string
  /** Omitted: the agent detects it from the repository. */
  readonly platform?: SetupPlatform | undefined
  /**
   * The plaintext, only when the person chose to paste it into their agent's chat. Without it the prompt
   * says the token is in `SMARTPLANE_TOKEN`, which the person sets in the agent's environment themselves.
   */
  readonly token?: string | undefined
  /** The API origin, when it is not the hosted one. */
  readonly apiUrl?: string | undefined
}

/**
 * The one-line prompt a person gives their coding agent after creating a machine token. The agent's
 * `smartplane` skill (references/deploy.md) knows the rest. The dashboard and the CLI print the same text.
 */
export const agentSetupPrompt = (input: AgentPromptInput): string => {
  const details = [
    `service: ${input.service}`,
    `platform: ${input.platform === undefined ? "detect it" : setupPlatformLabels[input.platform]}`,
    ...(input.apiUrl !== undefined && input.apiUrl !== DefaultSmartplaneApiUrl ? [`api: ${input.apiUrl}`] : [])
  ].join(", ")
  const where = input.token === undefined ? "The machine token is in the SMARTPLANE_TOKEN environment variable" : `Machine token: ${input.token}`
  return `Use the smartplane skill to set up this service with Smartplane secrets. ${where} (${details})`
}
