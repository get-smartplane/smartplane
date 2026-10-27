/** A `fetch` that records each request and answers from a fixed reply (or throws, to simulate the network). */
export interface FakeReply {
  readonly status?: number
  readonly body?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly throws?: unknown
}

export const fakeFetch = (reply: FakeReply, requests: Array<Request> = []) => async (request: Request): Promise<Response> => {
  requests.push(request)
  if (reply.throws !== undefined) throw reply.throws
  return new Response(reply.body ?? "", { status: reply.status ?? 200, headers: reply.headers ?? {} })
}
