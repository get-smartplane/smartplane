import type { ScanFinding } from "@pc/domain"
import { extensionOf } from "../../bundle/mime"
import type { ScanFile, ScanInput } from "../scanner"

const Scanner = "builtin"

const finding = (ruleId: string, severity: ScanFinding["severity"], title: string, detail: string, file?: string): ScanFinding => ({
  scanner: Scanner,
  ruleId: `builtin/${ruleId}`,
  severity,
  title,
  detail,
  ...(file === undefined ? {} : { file })
})

/** The Agent Skills spec: lowercase letters, digits and hyphens, up to 64 characters. */
const SkillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const frontmatterFindings = ({ skillMd, folder }: ScanInput): ReadonlyArray<ScanFinding> => {
  if (!skillMd.hasFrontmatter) {
    return [finding("frontmatter-missing", "medium", "SKILL.md has no frontmatter", "Agents choose skills by the frontmatter's name and description.", "SKILL.md")]
  }
  const expected = folder.split("/").at(-1) ?? ""
  return [
    ...(skillMd.name === undefined || skillMd.name.length > 64 || !SkillName.test(skillMd.name)
      ? [finding("frontmatter-name", "low", "Missing or malformed skill name", "`name` should be lowercase letters, digits and hyphens.", "SKILL.md")]
      : expected !== "" && skillMd.name !== expected
      ? [finding("frontmatter-name-mismatch", "low", "Name does not match its folder", `\`name: ${skillMd.name}\` is in folder "${expected}".`, "SKILL.md")]
      : []),
    ...(skillMd.description === undefined || skillMd.description.trim() === ""
      ? [finding("frontmatter-description", "medium", "Missing description", "Without a description agents cannot tell when to use the skill.", "SKILL.md")]
      : [])
  ]
}

/** Assets a skill legitimately ships; other binaries are flagged for review. */
const assets = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "pdf", "woff", "woff2", "ttf", "otf", "mp3", "wav", "mp4"])
const executables = new Set(["exe", "dll", "so", "dylib", "bin", "com", "msi", "scr", "jar", "class", "pyc", "node", "wasm"])
const archives = new Set(["zip", "tar", "gz", "tgz", "7z", "rar", "xz", "bz2"])

/** ELF, PE (`MZ`), Mach-O (both byte orders, 32/64-bit) and fat/Java class files. */
const nativeMagics: ReadonlyArray<ReadonlyArray<number>> = [
  [0x7f, 0x45, 0x4c, 0x46],
  [0x4d, 0x5a],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe]
]

const nativeMagic = (bytes: Uint8Array): boolean => nativeMagics.some((magic) => magic.every((byte, index) => bytes[index] === byte))

const fileTypeFinding = (file: ScanFile): ScanFinding | undefined => {
  const extension = extensionOf(file.path)
  if (executables.has(extension) || (file.text === undefined && nativeMagic(file.bytes))) {
    return finding("executable-binary", "high", "Compiled executable", "Native or bytecode binaries cannot be reviewed; ship source scripts instead.", file.path)
  }
  if (archives.has(extension)) return finding("nested-archive", "medium", "Nested archive", "Archives inside a skill hide their contents from review and scanning.", file.path)
  if (file.text === undefined && !assets.has(extension)) {
    return finding("unknown-binary", "medium", "Unrecognised binary file", "Only text and common asset formats are expected in a skill.", file.path)
  }
  return undefined
}

export const fileTypeFindings = ({ files }: ScanInput): ReadonlyArray<ScanFinding> =>
  files.flatMap((file) => {
    const found = fileTypeFinding(file)
    return found === undefined ? [] : [found]
  })
