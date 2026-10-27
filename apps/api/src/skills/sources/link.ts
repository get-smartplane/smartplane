import { InvalidInput, UpstreamFailure } from "@pc/domain"
import { Effect } from "effect"
import { archiveFormat, extractArchive } from "../archive/extract"
import { DefaultArchiveLimits } from "../archive/limits"
import { singleFileRoot } from "../bundle/bundle"
import { decodeText } from "../bundle/mime"
import { selectSkillRoot, type SkillRoot } from "../bundle/root"
import { SkillFetcher } from "../fetch/fetcher"

/** The largest SKILL.md accepted on its own; inline skills allow 100k characters, so this is generous. */
const MaxSkillMdBytes = 512 * 1024

/**
 * A link is either an archive of a skill folder (by magic bytes) or a single SKILL.md, which must be UTF-8
 * text, so a link to an HTML page or a binary is refused instead of becoming a skill.
 */
export const fetchLink = (url: string) =>
  Effect.gen(function*() {
    const response = yield* SkillFetcher.use((fetcher) => fetcher.get(url, { maxBytes: DefaultArchiveLimits.maxCompressedBytes }))
    if (response.status !== 200) return yield* new UpstreamFailure({ upstream: response.url.hostname, message: `the link answered ${response.status}` })
    if (archiveFormat(response.bytes) !== undefined) {
      return yield* Effect.flatMap(extractArchive(response.bytes, DefaultArchiveLimits), (files) => selectSkillRoot(files, undefined))
    }
    const text = decodeText(response.bytes)
    if (text === undefined || response.bytes.length > MaxSkillMdBytes || /^\s*<(?:!doctype|html)/i.test(text)) {
      return yield* new InvalidInput({ message: "the link is neither a SKILL.md file nor a .zip / .tar.gz archive", field: "url" })
    }
    const root: SkillRoot = singleFileRoot(response.bytes)
    return root
  }).pipe(Effect.withSpan("skills.fetchLink"))
