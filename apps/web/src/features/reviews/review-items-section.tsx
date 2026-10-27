import type { AccessReview, AccessReviewItem } from "@pc/domain"
import { TableFrame } from "@/components/layout/table-frame"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Beneficiaries } from "./beneficiaries"
import { ItemDecision } from "./item-decision"
import { ReviewedAccessLabel } from "./reviewed-access"

interface ReviewItemsSectionProps {
  readonly title: string
  readonly description: string
  readonly review: AccessReview
  readonly items: ReadonlyArray<AccessReviewItem>
}

/** One kind of reviewed access (memberships or grants), undecided items first. */
export function ReviewItemsSection({ title, description, review, items }: ReviewItemsSectionProps) {
  if (items.length === 0) return null
  const decided = items.filter((item) => item.decision !== null).length
  const ordered = [...items].sort((a, b) => Number(a.decision !== null) - Number(b.decision !== null))
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-[1.0625rem] leading-6">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {decided} of {items.length} decided
        </span>
      </div>
      <TableFrame>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[46%]">Access</TableHead>
              <TableHead className="hidden md:table-cell">Benefits</TableHead>
              <TableHead className="w-52 text-right sm:w-64">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((item) => (
              <TableRow key={item.id} className="align-top">
                <TableCell className="whitespace-normal">
                  <ReviewedAccessLabel access={item.access} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Beneficiaries userIds={item.beneficiaries} />
                </TableCell>
                <TableCell className="text-right whitespace-normal">
                  <ItemDecision review={review} item={item} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </section>
  )
}
