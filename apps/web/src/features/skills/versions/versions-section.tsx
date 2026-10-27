import type { SkillScanning, SkillVersion } from "@pc/domain"
import { Section } from "@/components/layout/section"
import { TableFrame } from "@/components/layout/table-frame"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCan } from "@/features/auth/me-context"
import { plural } from "../format"
import { isServable } from "./servable"
import { VersionRow } from "./version-row"

interface VersionsSectionProps {
  readonly versions: ReadonlyArray<SkillVersion>
  readonly scanning: SkillScanning | undefined
  readonly selected: number
  readonly onSelect: (version: number) => void
}

/** Every version, newest first. Choosing one shows its files and scan below; Activate serves it. */
export function VersionsSection({ versions, scanning, selected, onSelect }: VersionsSectionProps) {
  const canManage = useCan("resources:manage")
  const active = versions.find((version) => version.active)?.version
  const showScan = scanning?.enabled === true || versions.some((version) => version.scanStatus !== "skipped")
  return (
    <Section title="Versions" description="Versions never change once recorded. Agents are served the active one." aside={plural(versions.length, "version")}>
      <TableFrame>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28 sm:w-36">Version</TableHead>
              <TableHead className="hidden w-32 md:table-cell">Content hash</TableHead>
              <TableHead className="hidden w-32 lg:table-cell">Source</TableHead>
              <TableHead className="hidden sm:table-cell">Created</TableHead>
              {showScan && <TableHead className="w-28 sm:w-32">Scan</TableHead>}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...versions].sort((a, b) => b.version - a.version).map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                selected={version.version === selected}
                onSelect={() => onSelect(version.version)}
                showScan={showScan}
                activatable={canManage && !version.active && scanning !== undefined && isServable(version, scanning)}
                current={active}
              />
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </Section>
  )
}
