import type { AccountMode } from "../connections/account"
import type { ResourceConfig } from "./config"

/** The account mode of a credentialed resource; every other kind (and every config stored before modes) is `shared`. */
export const accountModeOf = (config: ResourceConfig): AccountMode =>
  config.kind === "mcp_server" || config.kind === "api" || config.kind === "integration" ? config.accountMode ?? "shared" : "shared"
