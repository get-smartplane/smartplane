import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ConfigFieldsProps } from "../config-draft"

export function SkillFields({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <>
      <FormField
        id="skill-summary"
        label="When to use"
        error={errors["config.description"]}
        description="Agents read this to decide whether to load the skill."
      >
        <Input
          id="skill-summary"
          placeholder="Use when drafting customer-facing release notes."
          value={draft.skillDescription}
          onChange={(event) => set("skillDescription", event.target.value)}
        />
      </FormField>
      <FormField
        id="skill-body"
        label="Instructions"
        error={errors["config.body"]}
        description="Agents also see this skill as a slash command in Claude Code, Cursor and VS Code. Arguments are under Advanced options."
      >
        <Textarea
          id="skill-body"
          rows={8}
          className="font-mono text-xs"
          placeholder="# Release notes&#10;&#10;1. …"
          value={draft.body}
          onChange={(event) => set("body", event.target.value)}
        />
      </FormField>
    </>
  )
}
