import { Layer } from "effect"
import { SkillDownloads } from "./download"
import { SkillFetcher } from "./fetch/fetcher"
import { SkillIngest } from "./ingest"
import { SkillScannersLive } from "./scan/live"
import { SkillScanRunner } from "./scan/scan-runner"
import { SkillContent } from "./serving/content"
import { Skills } from "./skills"
import { SkillSources } from "./sources/skill-sources"
import { SkillVersions } from "./versions"

/** Skill services the MCP gateway and the scan queue need: serving, ingest, fetching and scanning. */
export const SkillsCoreLive = Layer.mergeAll(
  SkillContent.layer,
  SkillIngest.layer,
  SkillFetcher.layer,
  SkillScanRunner.layer.pipe(Layer.provideMerge(SkillScannersLive))
)

/** The `/api/skills` services; they build on `Resources`, so they sit above the feature layer. */
export const SkillsApiLive = Layer.mergeAll(Skills.layer, SkillVersions.layer, SkillDownloads.layer).pipe(Layer.provide(SkillSources.layer))
