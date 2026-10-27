import { ChoiceCards } from "@/components/form/choice-cards"
import { useQueryData } from "@/components/query/use-query-data"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { teamsAtom } from "@/features/teams/atoms"

export type Audience = "everyone" | "team"

const choices = [
  { value: "everyone", label: "Everyone", description: "Every member, including people who join later." },
  { value: "team", label: "One team", description: "Only the people on a team you choose." }
] as const

interface WhoPickerProps {
  readonly audience: Audience
  readonly teamId: string
  readonly onAudience: (audience: Audience) => void
  readonly onTeam: (teamId: string) => void
  readonly invalid: boolean
}

/** Everyone (the Member role) or one team: the two grants most orgs start with. */
export function WhoPicker({ audience, teamId, onAudience, onTeam, invalid }: WhoPickerProps) {
  const teams = useQueryData(teamsAtom, [])
  return (
    <div className="flex flex-col gap-2">
      <ChoiceCards id="setup-grant-who" label="Who" choices={choices} value={audience} onChange={onAudience} columns={2} />
      {audience === "team" &&
        (teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet. Grant everyone for now, or create a team under Teams later.</p>
        ) : (
          <Select value={teamId} onValueChange={onTeam}>
            <SelectTrigger id="setup-grant-team" className="w-full sm:w-72" aria-label="Team" aria-invalid={invalid}>
              <SelectValue placeholder="Choose a team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
    </div>
  )
}
