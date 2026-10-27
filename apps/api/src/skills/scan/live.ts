import { Effect, Layer } from "effect"
import { builtinScanner } from "./builtin/scanner"
import { makeClefScanner } from "./clef"
import { SkillScanners } from "./scanner"

/** The scanners that run while `SKILL_SCANNING` is on. Add a scanner here to plug it in. */
export const SkillScannersLive = Layer.effect(SkillScanners, Effect.map(makeClefScanner, (clef) => [builtinScanner, clef]))
