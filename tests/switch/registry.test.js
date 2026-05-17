import test from "node:test";
import assert from "node:assert/strict";

import {
  SwitchRegistry,
  buildSwitchSuggestions,
} from "../../src/switch/registry.js";

function createI18n() {
  return {
    t: (key, values = {}) => {
      if (key === "switch.currentValue") return `current: ${values.value}`;
      return key;
    },
    raw: (key) => key,
  };
}

test("SwitchRegistry registers blocks and rejects duplicates", () => {
  const registry = new SwitchRegistry();
  registry.register({
    id: "model",
    label: "Model",
    description: "Switch active model",
    getCurrentValueLabel: () => "openai/gpt-5.4",
    getOptions: async () => [],
    apply: async () => ({ message: "ok" }),
  });

  assert.throws(
    () => registry.register({
      id: "model",
      label: "Model",
      description: "Duplicate",
      getCurrentValueLabel: () => "x",
      getOptions: async () => [],
      apply: async () => ({ message: "ok" }),
    }),
    /Duplicate switch block: model/,
  );
});

test("buildSwitchSuggestions exposes current values in descriptions", () => {
  const registry = new SwitchRegistry();
  registry.register({
    id: "model",
    label: "Model",
    description: "Switch active model",
    getCurrentValueLabel: () => "openai/gpt-5.4",
    getOptions: async () => [],
    apply: async () => ({ message: "ok" }),
  });
  registry.register({
    id: "debug",
    label: "Debug",
    description: "Toggle debug mode",
    getCurrentValueLabel: () => "off",
    getOptions: async () => [],
    apply: async () => ({ message: "ok" }),
  });

  const suggestions = buildSwitchSuggestions(registry, {
    i18n: createI18n(),
    runtimeOverrides: {},
  }, {});

  assert.deepEqual(suggestions, [
    {
      value: "model",
      label: "Model",
      description: "Switch active model · current: openai/gpt-5.4",
    },
    {
      value: "debug",
      label: "Debug",
      description: "Toggle debug mode · current: off",
    },
  ]);
});
