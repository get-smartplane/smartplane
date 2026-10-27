import { CopyButton } from "@/components/form/copy-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SetupGuide } from "./setup-snippets"

interface Props {
  readonly guides: ReadonlyArray<SetupGuide>
  readonly value: string
  readonly onValueChange: (value: string) => void
}

/** The exact manual steps per platform, for doing it by hand or checking what the agent did. */
export function ManualSetupTabs({ guides, value, onValueChange }: Props) {
  return (
    <section aria-labelledby="mtk-manual-heading" className="flex min-w-0 flex-col gap-2">
      <h3 id="mtk-manual-heading" className="text-sm font-medium">Or set it up yourself</h3>
      <Tabs value={value} onValueChange={onValueChange} className="min-w-0">
        <TabsList className="w-full justify-start overflow-x-auto">
          {guides.map((guide) => (
            <TabsTrigger key={guide.id} value={guide.id} className="flex-none px-2">
              {guide.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {guides.map((guide) => (
          <TabsContent key={guide.id} value={guide.id} className="flex min-w-0 flex-col gap-4 pt-1">
            {guide.blocks.map((block) => (
              <div key={block.where} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{block.where}</span>
                  <CopyButton text={block.code} />
                </div>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">{block.code}</pre>
              </div>
            ))}
            {guide.notes.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                {guide.notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
