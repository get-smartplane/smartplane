import { Command } from "effect/cli"
import { exportAudit } from "./export"
import { tailAudit } from "./tail"
import { verifyAudit } from "./verify"

export const audit = Command.make("audit").pipe(
  Command.withDescription("The hash-chained, append-only audit log"),
  Command.withSubcommands([tailAudit, verifyAudit, exportAudit])
)
