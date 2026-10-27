import { useCallback, useState } from "react"
import { isBundle, type SkillSource } from "./skill-source"
import { emptySourceDraft, type SetSourceDraft, type SkillDetails, type SourceDraft } from "./source-draft"
import { useSkillSourceForm } from "./use-skill-source-form"

/** The skill half of the "Add a resource" dialog: which source, its fields, and the form that creates it. */
export const useSkillSource = (details: SkillDetails) => {
  const [source, setSource] = useState<SkillSource>("github")
  const [draft, setDraft] = useState<SourceDraft>(emptySourceDraft)
  const { form, failure } = useSkillSourceForm(isBundle(source) ? source : "github", draft, details)
  const set: SetSourceDraft = useCallback((key, value) => setDraft((current) => ({ ...current, [key]: value })), [])
  const reset = useCallback(() => {
    setSource("github")
    setDraft(emptySourceDraft)
  }, [])
  return { source, setSource, draft, set, form, failure, reset }
}

export type SkillSourceState = ReturnType<typeof useSkillSource>
