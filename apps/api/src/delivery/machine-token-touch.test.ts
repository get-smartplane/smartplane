import { assert, describe, it } from "@effect/vitest"
import { MachineTokenId } from "@pc/domain"
import { DateTime, Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { TestDatabase } from "../testing/database"
import { now, orgId, userId } from "../testing/fixtures"
import { insertRow, seedOrg, selectRows } from "../testing/seed"
import { MachineTokensRepo } from "./machine-tokens-repo"

const id = MachineTokenId.make("mtk_touchme01")
const layer = MachineTokensRepo.layer.pipe(Layer.provideMerge(TestDatabase))
const touch = (ip: string) => MachineTokensRepo.use((repo) => repo.touch(id, ip))
const lastUse = Effect.map(selectRows("SELECT last_used_at, last_used_ip FROM machine_tokens WHERE id = ?", id), ([row]) => [row?.lastUsedAt, row?.lastUsedIp])

describe("machine token last use", () => {
  it.effect("is written at most once per 5 minutes unless the IP changes, and a failed write is not an error", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const at = DateTime.formatIso(now)
      yield* insertRow("machine_tokens", { id, orgId, name: "ci", prefix: "pcm_touch", tokenHash: "h", createdBy: userId, createdAt: at, expiresAt: DateTime.formatIso(DateTime.add(now, { days: 30 })) })
      yield* touch("10.0.0.1")
      const first = yield* lastUse
      yield* TestClock.adjust("1 minute")
      yield* touch("10.0.0.1")
      assert.deepStrictEqual(yield* lastUse, first)
      yield* touch("10.0.0.2")
      assert.strictEqual((yield* lastUse)[1], "10.0.0.2")

      yield* selectRows("CREATE TRIGGER d1_down BEFORE UPDATE ON machine_tokens BEGIN SELECT RAISE(ABORT, 'D1 unavailable'); END")
      yield* TestClock.adjust("10 minutes")
      yield* touch("10.0.0.3")
    }).pipe(Effect.provide(layer)))
})
