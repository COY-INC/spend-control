import assert from "node:assert";
import { hashPin, isHashed, verifyPin } from "./pin";

{
  const hashed = hashPin("1234");

  assert.equal(isHashed(hashed), true);
  assert.notEqual(hashed, "1234");
  assert.match(hashed, /^s1\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(verifyPin("1234", hashed), true);
  assert.equal(verifyPin("9999", hashed), false);
}

{
  const firstHash = hashPin("1234");
  const secondHash = hashPin("1234");

  assert.notEqual(firstHash, secondHash);
  assert.equal(verifyPin("1234", firstHash), true);
  assert.equal(verifyPin("1234", secondHash), true);
}

{
  assert.equal(isHashed("1234"), false);
  assert.equal(verifyPin("1234", "1234"), true);
  assert.equal(verifyPin("9999", "1234"), false);
}

{
  assert.equal(verifyPin("1234", "s1$invalid"), false);
  assert.equal(verifyPin("1234", "s1$$"), false);
}

console.log("ok: PIN hashing e verificação");
