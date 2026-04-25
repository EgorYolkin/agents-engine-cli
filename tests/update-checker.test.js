import test from "node:test";
import assert from "node:assert/strict";

import { checkForUpdate, compareVersions, REMOTE_PACKAGE_URL } from "../src/update/checker.js";

test("compareVersions detects newer patch, minor, and major versions", () => {
  assert.equal(compareVersions("1.2.0", "1.2.1") > 0, true);
  assert.equal(compareVersions("1.2.9", "1.3.0") > 0, true);
  assert.equal(compareVersions("1.9.9", "2.0.0") > 0, true);
});

test("compareVersions treats lower and equal versions as not newer", () => {
  assert.equal(compareVersions("1.2.0", "1.1.5") <= 0, true);
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
});

test("compareVersions handles prerelease precedence", () => {
  assert.equal(compareVersions("1.2.0-beta.1", "1.2.0") > 0, true);
  assert.equal(compareVersions("1.2.0-beta.1", "1.2.0-beta.2") > 0, true);
});

test("checkForUpdate reports available when remote version is greater", async () => {
  const calls = [];
  const result = await checkForUpdate({
    currentVersion: "1.2.0",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ version: "1.2.1" }),
      };
    },
  });

  assert.equal(result.available, true);
  assert.equal(result.unavailable, false);
  assert.equal(result.latestVersion, "1.2.1");
  assert.equal(calls[0].url, REMOTE_PACKAGE_URL);
  assert.equal(calls[0].options.headers.Accept, "application/json");
});

test("checkForUpdate reports current when remote version is lower", async () => {
  const result = await checkForUpdate({
    currentVersion: "1.2.0",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ version: "1.1.5" }),
    }),
  });

  assert.equal(result.available, false);
  assert.equal(result.unavailable, false);
  assert.equal(result.latestVersion, "1.1.5");
});

test("checkForUpdate returns unavailable on network errors", async () => {
  const result = await checkForUpdate({
    currentVersion: "1.2.0",
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  });

  assert.equal(result.available, false);
  assert.equal(result.unavailable, true);
  assert.match(result.reason, /network unavailable/);
});

test("checkForUpdate returns unavailable on invalid JSON", async () => {
  const result = await checkForUpdate({
    currentVersion: "1.2.0",
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    }),
  });

  assert.equal(result.available, false);
  assert.equal(result.unavailable, true);
  assert.match(result.reason, /bad json/);
});
