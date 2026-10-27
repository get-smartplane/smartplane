import { CopyButton } from "@/components/form/copy-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { McpSnippet } from "./mcp-config"

/** One tab per MCP client, each with its config and a copy button. */
export function SnippetTabs({ snippets }: { readonly snippets: ReadonlyArray<McpSnippet> }) {
  return (
    <Tabs defaultValue={snippets[0]?.id} className="min-w-0">
      <TabsList>
        {snippets.map((snippet) => (
          <TabsTrigger key={snippet.id} value={snippet.id}>
            {snippet.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {snippets.map((snippet) => (
        <TabsContent key={snippet.id} value={snippet.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{snippet.hint}</span>
            <CopyButton text={snippet.code} />
          </div>
          <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3.5 text-xs leading-relaxed">{snippet.code}</pre>
        </TabsContent>
      ))}
    </Tabs>
  )
}
