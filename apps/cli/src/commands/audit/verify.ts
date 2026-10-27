import { ChainVerification } from "@pc/domain"
import { Effect, Schema } from "effect"
import { Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { field } from "../../app/common-flags"
import { failure } from "../../app/failure"
import { emit } from "../../app/output"

const describe = (result: ChainVerification) =>
  result._tag === "Intact"
    ? `Chain intact: ${result.checked} events checked from seq ${result.fromSeq}.`
    : `Chain BROKEN at seq ${result.at} (${result.checked} events checked from seq ${result.fromSeq}).`

export const verifyAudit = Command.make("verify", {
  fromSeq: Flag.Int("from-seq").pipe(Flag.withSchema(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))), Flag.withDescription("Start re-hashing here"), Flag.optional)
}, (flags) =>
  Effect.gen(function*() {
    const result = yield* (yield* api).audit.verify({ query: field("fromSeq", flags.fromSeq) })
    yield* emit(ChainVerification, result, describe)
    // A broken chain is evidence of tampering: make it fail CI, not just print.
    if (result._tag === "Broken") return yield* failure(`Audit chain broken at seq ${result.at}.`)
  })).pipe(Command.withDescription("Re-hash the audit chain; exits 1 if it is broken"))
