import { Effect } from "effect"
import { runtime } from "@/lib/api/runtime"
import { AuthSession } from "@/lib/api/session"

/** Ends the WorkOS session server-side and resolves to where AuthKit wants the browser to go next. */
export const logoutAtom = runtime.fn(() => AuthSession.use((session) => session.logout).pipe(Effect.orElseSucceed(() => "/login")))
