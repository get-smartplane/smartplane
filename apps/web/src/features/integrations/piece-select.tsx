import type { IntegrationPieceSummary } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { catalogAtom } from "./atoms"
import { PieceLogo } from "./piece-logo"

interface PieceSelectProps {
  readonly id: string
  readonly value: string
  readonly onChange: (piece: IntegrationPieceSummary) => void
  readonly invalid?: boolean
}

/** A catalog piece, by logo and name. */
export function PieceSelect({ id, value, onChange, invalid }: PieceSelectProps) {
  const pieces = useQueryData(catalogAtom, [])
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const piece = pieces.find((candidate) => candidate.id === next)
        if (piece) onChange(piece)
      }}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder="Choose an integration…" />
      </SelectTrigger>
      <SelectContent>
        {pieces.map((piece) => (
          <SelectItem key={piece.id} value={piece.id}>
            <PieceLogo url={piece.logoUrl} name={piece.displayName} size="sm" className="size-5" />
            {piece.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
