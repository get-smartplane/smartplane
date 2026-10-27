import type { SkillVersion } from "@pc/domain"
import { EntityName } from "@/components/status/entity-name"
import { StatusBadge, StatusText } from "@/components/status/status-badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDateTime, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ActivateButton } from "./activate-button"
import { scanStatusMeta } from "./scan-status"
import { VersionSource } from "./version-source"

interface VersionRowProps {
  readonly version: SkillVersion
  readonly selected: boolean
  readonly onSelect: () => void
  readonly showScan: boolean
  readonly activatable: boolean
  /** The active version's number, for the confirmation copy. */
  readonly current: number | undefined
}

export function VersionRow({ version, selected, onSelect, showScan, activatable, current }: VersionRowProps) {
  const scan = scanStatusMeta[version.scanStatus]
  return (
    <TableRow data-state={selected ? "selected" : undefined} className={cn(selected && "bg-brand/6 hover:bg-brand/8")}>
      <TableCell>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={selected}
            aria-label={`Show version ${version.version}`}
            onClick={onSelect}
            className={cn("rounded-sm font-semibold tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50", selected && "text-brand")}
          >
            v{version.version}
          </button>
          {version.active && <StatusBadge tone="success">Active</StatusBadge>}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="font-mono text-xs text-muted-foreground" title={version.contentHash}>
          {version.contentHash.slice(0, 12)}
        </span>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <VersionSource source={version.source} />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <EntityName entity={{ kind: "user", id: version.createdBy }} className="min-w-0" />
          <span className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(version.createdAt)}>
            {formatRelative(version.createdAt)}
          </span>
        </div>
      </TableCell>
      {showScan && (
        <TableCell>
          <span className="flex flex-col gap-0.5 text-sm">
            <StatusText tone={scan.tone}>{scan.label}</StatusText>
            {version.override !== null && (
              <span className="truncate text-xs text-muted-foreground" title={version.override.reason}>
                Overridden
              </span>
            )}
          </span>
        </TableCell>
      )}
      <TableCell className="text-right">{activatable && <ActivateButton version={version} current={current} />}</TableCell>
    </TableRow>
  )
}
