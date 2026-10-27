import type { ResourceId, SkillVersion } from "@pc/domain"
import { Upload } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { useMutation } from "@/lib/api/use-mutation"
import type { FieldErrors } from "@/lib/forms/decode-form"
import type { FormController } from "@/lib/forms/use-form"
import { uploadVersionAtom } from "../atoms"
import { ArchiveDropZone } from "../create/archive-drop-zone"
import { archiveLimits } from "../create/skill-source"
import { SourceFailure } from "../create/source-failure"
import { formatBytes } from "../format"
import { describeSkillError, type SkillFailure } from "../skill-error"

interface UploadVersionDialogProps {
  readonly resourceId: ResourceId
  readonly onUploaded: (version: SkillVersion) => void
}

/** A new archive becomes the next version; it is served only once someone activates it. */
export function UploadVersionDialog({ resourceId, onUploaded }: UploadVersionDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<SkillFailure | null>(null)
  const upload = useMutation(uploadVersionAtom, { quiet: true })

  const reset = () => {
    setErrors({})
    setFailure(null)
  }
  const form: FormController<SkillVersion> = {
    errors,
    pending: upload.pending,
    reset,
    submit: async () => {
      reset()
      if (file === null) return void setErrors({ file: "Choose a .zip or .tar.gz file." })
      if (file.size > archiveLimits.maxBytes) return void setErrors({ file: `This file is ${formatBytes(file.size)}; archives can be at most ${formatBytes(archiveLimits.maxBytes)}.` })
      const outcome = await upload.execute({ id: resourceId, filename: file.name, archive: new Uint8Array(await file.arrayBuffer()) })
      if (outcome._tag === "Success") return outcome.value
      setFailure(describeSkillError(outcome.error))
      return undefined
    }
  }

  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <Upload />
          Upload new version
        </Button>
      }
      title="Upload a new version"
      description="It is recorded as the next version and served once you activate it. The current version keeps serving until then."
      submitLabel={upload.pending ? "Uploading…" : "Upload"}
      form={form}
      input={() => null}
      onSuccess={onUploaded}
      onOpenChange={(open) => !open && setFile(null)}
    >
      <FormField id="skill-version-archive" label="Archive" error={errors.file}>
        <ArchiveDropZone id="skill-version-archive" file={file} onFile={setFile} invalid={errors.file !== undefined} />
      </FormField>
      {failure && <SourceFailure failure={failure} />}
    </FormDialog>
  )
}
