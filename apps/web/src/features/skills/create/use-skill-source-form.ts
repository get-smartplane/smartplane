import { CreateSkill, parseGithubSpec, UploadSkillQuery, type Resource, type SkillCreated } from "@pc/domain"
import { Result } from "effect"
import { useCallback, useMemo, useState } from "react"
import { useCreatorAccessNote } from "@/features/resources/creator-access"
import type { ApiError } from "@/lib/api/errors"
import type { Outcome } from "@/lib/api/outcome"
import { useMutation } from "@/lib/api/use-mutation"
import { decodeForm, type FieldErrors } from "@/lib/forms/decode-form"
import type { FormController } from "@/lib/forms/use-form"
import { createSkillAtom, uploadSkillAtom } from "../atoms"
import { formatBytes } from "../format"
import { describeSkillError, type SkillFailure } from "../skill-error"
import { archiveLimits, type BundleSource } from "./skill-source"
import type { SkillDetails, SourceDraft } from "./source-draft"

const messages = { name: "Enter a name between 1 and 80 characters.", "source.url": "Enter an https:// URL to a SKILL.md, .zip or .tar.gz." }
const specHint = "Use owner/repo, owner/repo/path@ref or a github.com URL."

/** Schema paths under `source` belong to whichever control the chosen source shows. */
const toFields = (errors: FieldErrors): FieldErrors =>
  Object.fromEntries(
    Object.entries(errors).map(([key, message]) =>
      key.startsWith("source.url") ? ["url", message] : key.startsWith("source.tokenSecretId") ? ["tokenSecretId", message] : key.startsWith("source") ? ["spec", specHint] : [key, message]
    )
  )

const optional = <K extends string, V>(key: K, value: V | null | undefined | "") => (value === null || value === undefined || value === "" ? {} : { [key]: value })

const fileError = (file: File | null): string | undefined =>
  file === null
    ? "Choose a .zip or .tar.gz file."
    : file.size > archiveLimits.maxBytes
      ? `This file is ${formatBytes(file.size)}; archives can be at most ${formatBytes(archiveLimits.maxBytes)}.`
      : undefined

/**
 * Creates a bundle skill from GitHub, a link or an upload. Server failures become plain-language `failure`
 * copy (with the folders to choose from when a source holds several skills) instead of a toast.
 */
export const useSkillSourceForm = (source: BundleSource, draft: SourceDraft, details: SkillDetails) => {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<SkillFailure | null>(null)
  const successDetail = useCreatorAccessNote("skill")
  const create = useMutation(createSkillAtom, { quiet: true, success: "Skill added", successDetail })
  const upload = useMutation(uploadSkillAtom, { quiet: true, success: "Skill added", successDetail })
  const decodeCreate = useMemo(() => decodeForm(CreateSkill, messages), [])
  const decodeUpload = useMemo(() => decodeForm(UploadSkillQuery, messages), [])

  const settle = <E extends ApiError>(outcome: Outcome<SkillCreated, E>): Resource | undefined => {
    if (outcome._tag === "Success") return outcome.value.resource
    setFailure(describeSkillError(outcome.error))
    return undefined
  }

  const fail = (next: FieldErrors) => {
    setErrors(next)
    return undefined
  }

  const submitUpload = async (): Promise<Resource | undefined> => {
    const problem = fileError(draft.file)
    const query = decodeUpload({ name: details.name, ...optional("description", details.description), ...optional("projectId", details.projectId), filename: draft.file?.name })
    if (problem !== undefined || query._tag === "Invalid" || draft.file === null) return fail({ ...(query._tag === "Invalid" ? query.errors : {}), ...optional("file", problem) })
    const archive = new Uint8Array(await draft.file.arrayBuffer())
    return settle(await upload.execute({ query: query.value, archive }))
  }

  const submitRemote = async (): Promise<Resource | undefined> => {
    const spec = parseGithubSpec(draft.spec)
    const remote =
      source === "link"
        ? { type: "link", url: draft.url.trim() }
        : { type: "github", ...Result.getOrElse(spec, () => ({})), ...optional("tokenSecretId", draft.tokenSecretId) }
    const decoded = decodeCreate({ name: details.name, ...optional("description", details.description), projectId: details.projectId, source: remote })
    if (decoded._tag === "Invalid") return fail(toFields(decoded.errors))
    return settle(await create.execute(decoded.value))
  }

  const reset = useCallback(() => {
    setErrors({})
    setFailure(null)
  }, [])

  const form: FormController<Resource> = {
    errors,
    pending: create.pending || upload.pending,
    submit: async () => {
      reset()
      return source === "upload" ? submitUpload() : submitRemote()
    },
    reset
  }
  return { form, failure }
}
