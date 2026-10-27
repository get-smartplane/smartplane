import type { CSSProperties } from "react"
import { DoodlePerson } from "../sky/doodle-person"
import type { Audience } from "./who-picker"

const seats = 5

/**
 * Who gets a seat: everyone fills the row, one team a few seats. The people take their seats one after
 * another whenever the choice changes; the words beside them say the same thing for screen readers.
 */
export function Cabin({ audience, teamName }: { readonly audience: Audience; readonly teamName: string | undefined }) {
  const filled = audience === "everyone" ? seats : 2
  const words = audience === "everyone" ? "Every member gets a seat" : `Only ${teamName ?? "one team"} gets a seat`
  return (
    <div className="flex flex-row-reverse items-end gap-3 sm:flex-row">
      <div key={audience} aria-hidden="true" className="flex items-end gap-1.5">
        {Array.from({ length: seats }, (_, index) => (
          <div key={index} className="relative flex h-14 w-8 items-end justify-center">
            <span className="absolute inset-x-0 bottom-0 h-5 rounded-t-md rounded-b-sm border-2 border-foreground/25 bg-muted" />
            {index < filled && (
              <span className="onb-seat-in relative -mb-0.5 w-6" style={{ "--i": index } as CSSProperties}>
                <DoodlePerson />
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="pb-1 text-sm text-muted-foreground">{words}</p>
    </div>
  )
}
