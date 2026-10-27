import { Layer } from "effect"
import { AppConfig, type EnvConfig } from "../platform/config"
import { SkillBlobs } from "../skills/storage/blobs"
import { SkillPolicyRepo } from "../skills/storage/policy-repo"
import { SkillVersionsRepo } from "../skills/storage/versions-repo"
import { SkillContent } from "../skills/serving/content"
import { testConfig } from "./config"
import { TestDatabase } from "./database"

export type Scanning = NonNullable<EnvConfig["SKILL_SCANNING"]>

/** The real skill storage over a migrated in-memory D1 and in-memory blobs, with the scanning flag set. */
export const skillStorage = (scanning: Scanning = "off", blobs = new Map<string, Uint8Array>()) =>
  Layer.mergeAll(SkillVersionsRepo.layer, SkillPolicyRepo.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(TestDatabase, SkillBlobs.memory(blobs), Layer.succeed(AppConfig, { ...testConfig, SKILL_SCANNING: scanning })))
  )

/** `SkillContent` over `skillStorage`; with only inline skills granted it never touches storage. */
export const skillContent = (scanning: Scanning = "off") => SkillContent.layer.pipe(Layer.provideMerge(skillStorage(scanning)))
