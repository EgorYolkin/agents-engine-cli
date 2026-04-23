import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { builtInConfig } from "../src/config/schema.js";
import { getAppPaths, loadConfig, saveConfig } from "../src/config/loader.js";

test("saveConfig persists orchestrator settings", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mr-mush-config-"));
  const cwd = path.join(tempRoot, "workspace");
  const homeDir = path.join(tempRoot, "home");

  await fs.mkdir(cwd, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });

  const paths = getAppPaths(cwd, homeDir);
  await saveConfig({
    ...builtInConfig,
    orchestrator: {
      ...builtInConfig.orchestrator,
      enabled: true,
      router_provider: "openai",
      router_model: "gpt-4o-mini",
    },
  }, paths);

  const loaded = await loadConfig({ cwd, homeDir });

  assert.equal(loaded.orchestrator.enabled, true);
  assert.equal(loaded.orchestrator.router_provider, "openai");
  assert.equal(loaded.orchestrator.router_model, "gpt-4o-mini");
});
