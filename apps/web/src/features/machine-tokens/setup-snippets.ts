import { agentSetupPrompt, DefaultSmartplaneApiUrl, type SetupPlatform } from "@pc/domain"
import { vercelGuide, nodeGuide, workersGuide } from "./setup/function-guides"
import { dockerGuide, flyGuide, railwayGuide } from "./setup/server-guides"
import type { SetupGuide } from "./setup/types"

export type { SetupBlock, SetupGuide } from "./setup/types"

/** `https://api.example.com/api/secrets/deliver` → `https://api.example.com`, or undefined for the default. */
export const apiUrlOf = (deliverUrl: string): string | undefined => {
  try {
    const origin = new URL(deliverUrl).origin
    return origin === DefaultSmartplaneApiUrl ? undefined : origin
  } catch {
    return undefined
  }
}

/**
 * Ready-to-paste setup for a new machine token, built only while its plaintext is on screen. The SDK is not
 * published yet, so there is deliberately no install line for it.
 */
export const setupGuides = (token: string, deliverUrl: string): ReadonlyArray<SetupGuide> => {
  const context = { token, apiUrl: apiUrlOf(deliverUrl) }
  return [railwayGuide, vercelGuide, workersGuide, flyGuide, dockerGuide, nodeGuide].map((guide) => guide(context))
}

/** How the agent gets the token: in the chat, or from `SMARTPLANE_TOKEN` the person sets themselves. */
export type PromptMode = "paste" | "env"

export interface AgentPromptChoice {
  readonly service: string
  readonly token: string
  readonly deliverUrl: string
  readonly platform: SetupPlatform | undefined
  readonly mode: PromptMode
}

/** The dashboard's copy of the prompt `machine-tokens create` prints; the token is in it only in paste mode. */
export const dashboardAgentPrompt = (choice: AgentPromptChoice): string =>
  agentSetupPrompt({
    service: choice.service,
    platform: choice.platform,
    token: choice.mode === "paste" ? choice.token : undefined,
    apiUrl: apiUrlOf(choice.deliverUrl)
  })

/** What the agent's environment needs in env mode; the person runs this themselves before starting the agent. */
export const agentEnvLine = (token: string): string => `export SMARTPLANE_TOKEN=${token}`
