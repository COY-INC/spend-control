import assert from "node:assert";
import type { AddressInfo } from "node:net";
import express from "express";
import { loginLimiter, trustProxySetting } from "./rateLimit";

assert.equal(trustProxySetting(undefined), 0);
assert.equal(trustProxySetting(""), 0);
assert.equal(trustProxySetting("abc"), 0);
assert.equal(trustProxySetting("-1"), 0);
assert.equal(trustProxySetting("1"), 1);
assert.equal(trustProxySetting("2"), 2);

(async () => {
  const app = express();
  app.post("/login", loginLimiter({ limit: 2 }), (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const hit = () => fetch(`http://127.0.0.1:${port}/login`, { method: "POST" });

  try {
    assert.equal((await hit()).status, 200);
    const second = await hit();
    assert.equal(second.status, 200);
    assert.ok(second.headers.get("ratelimit"));

    const blocked = await hit();
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: "Muitas requisições. Tente novamente mais tarde." });
  } finally {
    server.close();
  }
})();
