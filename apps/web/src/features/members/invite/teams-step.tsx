import { CreateTeam, type TeamId } from "@pc/domain"
import { Schema } from "effect"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { grantsAtom } from "@/features/access/atoms"
import { createTeamAtom, teamsAtom } from "@/features/teams/atoms"
import { useMutation } from "@/lib/api/use-mutation"

const isTeamInput = Schema.is(CreateTeam)

interface TeamsStepProps {
  readonly teamIds: ReadonlyArray<TeamId>
  readonly onChange: (teamIds: ReadonlyArray<TeamId>) => void
}

/** Teams to join on acceptance, with what each already carries; a missing team can be made right here. */
export function TeamsStep({ teamIds, onChange }: TeamsStepProps) {
  const teams = useQueryData(teamsAtom, [])
  const grants = useQueryData(grantsAtom, [])
  const [name, setName] = useState("")
  const create = useMutation(createTeamAtom, { success: "Team created" })
  const toggle = (id: TeamId, on: boolean) => onChange(on ? [...teamIds, id] : teamIds.filter((other) => other !== id))

  const add = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    const input = { name: name.trim() }
    if (!isTeamInput(input)) return
    const created = await create.execute(input)
    if (created._tag !== "Success") return
    onChange([...teamIds, created.value.id])
    setName("")
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">They join these teams when they accept, and get whatever access the teams have.</p>
      {teams.length > 0 && (
        <ul className="flex flex-col rounded-lg border bg-card p-1">
          {teams.map((team) => {
            const synced = team.directoryGroupId !== null
            const carried = grants.filter((grant) => grant.subject.type === "team" && grant.subject.id === team.id).length
            const checkboxId = `invite-team-${team.id}`
            return (
              <li key={team.id}>
                <Label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 font-normal hover:bg-muted/60 has-disabled:cursor-default has-disabled:hover:bg-transparent">
                  <Checkbox id={checkboxId} disabled={synced} checked={teamIds.includes(team.id)} onCheckedChange={(on) => toggle(team.id, on === true)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{team.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {synced
                        ? "Synced from your identity provider; membership is managed there"
                        : `${team.memberCount} ${team.memberCount === 1 ? "member" : "members"} · ${carried === 0 ? "no grants yet" : `${carried} ${carried === 1 ? "grant" : "grants"}`}`}
                    </span>
                  </span>
                </Label>
              </li>
            )
          })}
        </ul>
      )}
      {/* A form inside the dialog's form is invalid HTML, so this is a group submitted by its button. */}
      <div role="group" aria-label="Create a team" className="flex gap-2">
        <Input
          aria-label="New team name"
          placeholder={teams.length === 0 ? "Name your first team" : "New team name"}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void add(event)}
        />
        <Button type="button" variant="outline" disabled={name.trim() === "" || create.pending} onClick={(event) => void add(event)}>
          <Plus />
          Create team
        </Button>
      </div>
    </div>
  )
}
