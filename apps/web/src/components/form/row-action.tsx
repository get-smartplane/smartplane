import type { ComponentProps, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface RowActionProps extends Omit<ComponentProps<typeof Button>, "children" | "aria-label"> {
  /** Names the action for screen readers and in the tooltip, so an icon never stands alone. */
  readonly label: string
  readonly children: ReactNode
  /** Destructive actions tint red on hover; they always confirm before running. */
  readonly danger?: boolean
  /** Shown instead of the label when the action is unavailable, saying why. */
  readonly disabledReason?: string
}

/** The one shape for per-row actions in every table: an icon button with its name on hover and focus. */
export function RowAction({ label, children, danger, disabled, disabledReason, className, ...props }: RowActionProps) {
  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      className={cn("text-muted-foreground", danger && "hover:bg-destructive/10 hover:text-danger-ink", className)}
      {...props}
    >
      {children}
    </Button>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button swallows pointer events, so its tooltip hangs off a focusable wrapper. */}
        {disabled ? <span tabIndex={0} className="inline-flex rounded-md">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent>{disabled && disabledReason ? disabledReason : label}</TooltipContent>
    </Tooltip>
  )
}
