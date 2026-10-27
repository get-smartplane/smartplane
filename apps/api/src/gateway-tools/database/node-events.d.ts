// mysql2's typings import Node's `events` and `stream`. The Worker gets them from nodejs_compat at runtime;
// these minimal declarations let the typings resolve without pulling @types/node into the Worker's globals.
declare module "events" {
  export class EventEmitter {
    on(event: string, listener: (...args: Array<unknown>) => void): this
  }
}

declare module "stream" {
  export class Readable {}
}
