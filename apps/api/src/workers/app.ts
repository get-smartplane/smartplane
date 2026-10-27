import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { AppRoutes } from "../http/app"
import type { WorkerEnv } from "../platform/bindings"
import { appServices } from "./layers"
import { makeRunner } from "./runner"

/**
 * Built lazily on the first invocation of an isolate, not at module scope: Workers forbid I/O, timers and
 * randomness during global evaluation. The router and the runtime share one MemoMap, so services are built
 * once and shared by fetch, queue and scheduled.
 */
const make = (env: WorkerEnv) => {
  const memoMap = Layer.makeMemoMapUnsafe()
  const services = appServices(env)
  const web = HttpRouter.toWebHandler(AppRoutes.pipe(Layer.provideMerge(services)), { memoMap })
  return { web, runner: makeRunner(services, memoMap) }
}

let app: ReturnType<typeof make> | undefined

export const appFor = (env: WorkerEnv) => (app ??= make(env))
