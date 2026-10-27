import { assert, describe, it } from "@effect/vitest"
import { Redacted } from "effect"
import { fakeFetch } from "../../../testing/fake-fetch"
import { makeClickHouseDriver } from "./driver"
import { tableFunctionRefusal } from "./table-functions"

const connection = Redacted.make("https://agent:hunter2@ch.example.com:8443/analytics")

describe("ClickHouse table functions on a read-only grant", () => {
  it("refuses every table function that is not allow-listed, however it is spelled or placed", () => {
    const calls: ReadonlyArray<readonly [string, string]> = [
      ["SELECT * FROM url('http://169.254.169.254/latest', CSV)", "url"],
      ["select * from URL ('http://x', CSV)", "URL"],
      ["SELECT * FROM s3Cluster('c', 'https://bucket/key')", "s3Cluster"],
      ["SELECT * FROM `remote`('db:9000', system.one)", "remote"],
      ["SELECT * FROM \"remoteSecure\"('db:9440', system.one)", "remoteSecure"],
      ["SELECT * FROM file /* why */ ('/etc/passwd')", "file"],
      ["SELECT * FROM mysql -- c\n ('h:3306', 'db', 't', 'u', 'p')", "mysql"],
      ["SELECT '#' FROM postgresql/**/('h', 'db', 't', 'u', 'p')", "postgresql"],
      ["WITH x AS (SELECT * FROM hdfs('hdfs://h/f')) SELECT * FROM x", "hdfs"],
      ["SELECT * FROM numbers(1), gcs('b')", "gcs"],
      ["SELECT * FROM t AS a LEFT JOIN jdbc('j', 't') AS b ON a.id = b.id", "jdbc"],
      // The block-list missed these lakehouse readers: they fetch any object-store URL.
      ["SELECT * FROM iceberg('https://bucket/table/')", "iceberg"],
      ["SELECT * FROM icebergS3('https://bucket/table/')", "icebergS3"],
      ["SELECT * FROM deltaLake('https://bucket/table/')", "deltaLake"],
      ["SELECT * FROM hudi('https://bucket/table/')", "hudi"],
      ["SELECT * FROM executable('script.sh', 'TSV', 'x String')", "executable"],
      ["SELECT * FROM view(SELECT * FROM url('http://x', CSV))", "url"],
      ["SELECT * FROM t WHERE id IN (SELECT id FROM cluster('c', db.t))", "cluster"],
      ["SELECT * FROM t WHERE id GLOBAL IN remote('db:9000', db.t)", "remote"],
      ["DESCRIBE TABLE url('http://x', CSV)", "url"],
      ["SELECT EXTRACT(DAY FROM (SELECT max(d) FROM s3('https://b/k')))", "s3"]
    ]
    for (const [sql, name] of calls) assert.include(tableFunctionRefusal(sql) ?? "", `${name}()`, sql)
  })

  it("refuses text whose comments or quotes ClickHouse could read differently", () => {
    for (const sql of [
      "SELECT 1 /* /* */ FROM url('http://x', CSV) -- */",
      "SELECT 'unterminated FROM url('http://x', CSV)",
      "SELECT $tag$ FROM url('http://x') "
    ]) assert.include(tableFunctionRefusal(sql) ?? "", "cannot run SQL with", sql)
  })

  it("leaves ordinary queries, scalar and aggregate functions, and row generators alone", () => {
    for (const sql of [
      "SELECT url, file, remote FROM visits WHERE s3 = 1",
      "SELECT domain(url), path(url), count() FROM visits GROUP BY domain(url), path(url) ORDER BY count() DESC, max(t) LIMIT 10",
      "SELECT a.x, b.y FROM db.a AS a INNER JOIN db.b AS b USING (id) WHERE b.y IN (1, 2) AND a.x IN tuple(1, 2)",
      "SELECT * FROM numbers(10), zeros(2) ARRAY JOIN range(3) AS r",
      "SELECT * FROM view(SELECT number FROM numbers(3))",
      "SELECT EXTRACT(YEAR FROM toDate(d)), substring(s FROM 2 FOR 3), trim(BOTH ' ' FROM name) FROM t",
      "SELECT a IS NOT DISTINCT FROM coalesce(b, 0) FROM t",
      "SELECT POSITION('a' IN lower(s)) FROM t",
      "SELECT 'FROM url(x)' AS s, `FROM url(` FROM t -- FROM url('x')",
      "SELECT {p1:String}"
    ]) assert.isUndefined(tableFunctionRefusal(sql), sql)
  })

  it("refuses them on a read-only grant before calling the server, and lets a read-write grant send them", async () => {
    const requests: Array<Request> = []
    const driver = makeClickHouseDriver(fakeFetch({ body: "" }, requests))
    const sql = "SELECT * FROM iceberg('http://10.0.0.1/admin')"
    const failure = await driver.execute(connection, { sql, params: [] }, { readOnly: true, maxRows: 2, timeoutMs: 10_000 }).then(
      () => assert.fail("expected the iceberg() call to be refused"),
      (error: unknown) => error
    )
    assert.include(String(failure), "iceberg() table function")
    assert.lengthOf(requests, 0)
    await driver.execute(connection, { sql, params: [] }, { readOnly: false, maxRows: 2, timeoutMs: 10_000 })
    assert.lengthOf(requests, 1)
  })
})
