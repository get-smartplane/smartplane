import { Button } from "@/components/ui/button"
import { mcpPresets } from "./mcp-presets"

/** One click fills the name and URL of a common hosted server. */
export function McpPresetPicker({ onPick }: { readonly onPick: (preset: (typeof mcpPresets)[number]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">Start from</span>
      {mcpPresets.map((preset) => (
        <Button key={preset.name} type="button" variant="outline" size="xs" onClick={() => onPick(preset)}>
          {preset.name}
        </Button>
      ))}
    </div>
  )
}
