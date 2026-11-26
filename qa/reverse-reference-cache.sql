CREATE TABLE IF NOT EXISTS reverse_reference_cache (
 slot INTEGER PRIMARY KEY CHECK(slot>=0 AND slot<4096),
 cache_key TEXT NOT NULL CHECK(length(cache_key)=64),
 payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=4096),
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reverse_reference_cache_expiry ON reverse_reference_cache(expires_at);
