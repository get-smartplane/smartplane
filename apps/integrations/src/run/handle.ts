import { InvalidInput } from "@pc/domain"
import { type RunResponse, RunRequestJson, RunResponseJson } from "@pc/integrations/rpc"
import { Effect, Schema } from "effect"
import { continueTrace } from "../telemetry/trace"
import { PieceRunner } from "./runner"

const traceOf = (raw: unknown): unknown => (typeof raw === "object" && raw !== null && "trace" in raw ? raw.trace : undefined)

/**
 * The RPC boundary: decodes the request, runs it, and always answers with an encoded `RunResponse`
 * (typed failures included), so apps/api never has to interpret a thrown error.
 */
export const handleRun = (raw: unknown) =>
  Effect.gen(function*() {
    const runner = yield* PieceRunner
    const response: RunResponse = yield* Schema.decodeUnknownEffect(RunRequestJson)(raw).pipe(
      Effect.mapError(() => new InvalidInput({ message: "malformed run request" })),
      Effect.flatMap(runner.run),
      Effect.match({
        onFailure: (error): RunResponse => ({ ok: false, error }),
        onSuccess: (result): RunResponse => ({ ok: true, result })
      })
    )
    return yield* Schema.encodeEffect(RunResponseJson)(response).pipe(Effect.orDie)
  }).pipe(continueTrace("integrations.run", traceOf(raw), { "rpc.method": "run" }))
