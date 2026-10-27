import type { SetupPlatform } from "@pc/domain"

/** One block a person pastes somewhere: where it goes, and the text. */
export interface SetupBlock {
  readonly where: string
  readonly code: string
}

/** A platform tab, or the plain Node SDK one, with its steps and any caveats said once below them. */
export interface SetupGuide {
  readonly id: SetupPlatform | "node"
  readonly label: string
  readonly blocks: ReadonlyArray<SetupBlock>
  readonly notes: ReadonlyArray<string>
}

/** What every guide is built from, only while the plaintext is on screen. */
export interface SetupContext {
  readonly token: string
  /** The API origin when it is not the hosted one; the CLI and SDK default to that. */
  readonly apiUrl: string | undefined
}

/** `SMARTPLANE_TOKEN=…` plus, for another deployment, `SMARTPLANE_API_URL=…`. */
export const envLines = ({ token, apiUrl }: SetupContext): ReadonlyArray<string> => [
  `SMARTPLANE_TOKEN=${token}`,
  ...(apiUrl ? [`SMARTPLANE_API_URL=${apiUrl}`] : [])
]

/** The SDK is not on npm yet: guides show its code but never an install line. */
export const sdkComingSoon = "@smartplane/secrets is coming soon to npm; until then there is no install step for it."
