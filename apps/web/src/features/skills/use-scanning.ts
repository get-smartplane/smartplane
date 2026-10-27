import type { SkillScanning } from "@pc/domain"
import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { scanningAtom } from "./atoms"

/** Scanning is experimental and off unless the deployment turns it on; `undefined` until known. */
export const useScanning = (): SkillScanning | undefined => AsyncResult.getOrElse(useAtomValue(scanningAtom), () => undefined)
