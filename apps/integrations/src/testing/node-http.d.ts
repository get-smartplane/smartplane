// Minimal declarations for the Node built-in the tests use as a stand-in provider; the Worker never imports it.
declare module "node:http" {
  export interface IncomingHttpHeaders {
    readonly [name: string]: string | Array<string> | undefined
  }
  export interface IncomingMessage {
    readonly method?: string
    readonly url?: string
    readonly headers: IncomingHttpHeaders
    on(event: "data", listener: (chunk: string) => void): this
    on(event: "end", listener: () => void): this
  }
  export interface ServerResponse {
    setHeader(name: string, value: string): this
    end(body: string): void
  }
  export interface Server {
    listen(port: number, host: string, callback: () => void): this
    address(): { readonly port: number } | string | null
    close(): void
  }
  export function createServer(handler: (request: IncomingMessage, response: ServerResponse) => void): Server
  const http: { readonly createServer: typeof createServer }
  export default http
}
