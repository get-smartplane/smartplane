import type { Grant, Resource } from "@pc/domain"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ActionLevel } from "./action-level"
import { conditionCount } from "./grant-conditions"
import { LimitedMark } from "./limited-mark"
import { strongestAction, subjectKey } from "./subject-key"
import { SubjectLabel } from "./subject-label"

interface GrantMatrixProps {
  readonly grants: ReadonlyArray<Grant>
  readonly resources: ReadonlyArray<Resource>
}

/** Subjects × resources; each cell shows the strongest granted action. */
export function GrantMatrix({ grants, resources }: GrantMatrixProps) {
  const subjects = [...new Map(grants.map((grant) => [subjectKey(grant.subject), grant.subject])).values()]
  const columns = resources.filter((resource) => grants.some((grant) => grant.resourceId === resource.id))

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-card">Subject</TableHead>
            {columns.map((resource) => (
              <TableHead key={resource.id} className="text-center whitespace-nowrap">
                {resource.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {subjects.map((subject) => {
            const key = subjectKey(subject)
            return (
              <TableRow key={key}>
                <TableCell className="sticky left-0 bg-card">
                  <SubjectLabel subject={subject} />
                </TableCell>
                {columns.map((resource) => {
                  const cell = grants.filter((grant) => grant.resourceId === resource.id && subjectKey(grant.subject) === key)
                  const action = strongestAction(cell)
                  const limited = cell.some((grant) => conditionCount(grant.conditions) > 0)
                  return (
                    <TableCell key={resource.id} className="text-center">
                      {action ? <ActionLevel action={action} /> : <span className="text-muted-foreground/50">—</span>}
                      {limited && <LimitedMark grants={cell} />}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
