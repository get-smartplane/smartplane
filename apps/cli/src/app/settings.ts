import { Flag, GlobalFlag } from "effect/cli"

/** Machine-readable output on every command: JSON documents, or NDJSON for streams. */
export const JsonOutput = GlobalFlag.Setting("json")({
  flag: Flag.Boolean("json").pipe(Flag.withDescription("Print JSON instead of tables"), Flag.withDefault(false))
})

export const ProfileName = GlobalFlag.Setting("profile")({
  flag: Flag.String("profile").pipe(
    Flag.withDescription("Saved login to use (default: $SMARTPLANE_PROFILE or \"default\")"),
    Flag.optional
  )
})

export const ApiUrlOverride = GlobalFlag.Setting("api-url")({
  flag: Flag.String("api-url").pipe(
    Flag.withDescription("Smartplane origin, for self-hosted or local (default: https://app.smartplane.dev)"),
    Flag.optional
  )
})

export const globalSettings = [JsonOutput, ProfileName, ApiUrlOverride] as const
