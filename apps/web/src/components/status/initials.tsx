import { cn } from "@/lib/utils"

const initialsOf = (text: string) =>
  text
    .split(/[\s@._-]+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?"

/** A quiet monogram so rows of people scan by face-shape, not by reading every email. */
export function Initials({ name, className }: { readonly name: string; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[0.6875rem] font-semibold text-accent-foreground",
        className
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
