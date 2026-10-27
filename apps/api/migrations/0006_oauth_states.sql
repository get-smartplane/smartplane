-- OAuth sign-ins in flight, keyed by their unguessable `state`. Single use: the callback takes a state with
-- DELETE ... RETURNING, which D1 runs on the primary, so a replayed redirect finds nothing. (Workers KV, used
-- before, is eventually consistent: a second read could still see a state another request had deleted.)
-- `value` is the schema-encoded JSON of the pending flow; any client secret in it is already sealed.
CREATE TABLE oauth_states (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  -- Epoch milliseconds. Expired rows are never taken and are swept on later writes.
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states (expires_at);
