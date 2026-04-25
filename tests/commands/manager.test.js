import test from "node:test";
import assert from "node:assert/strict";

import { CommandManager, createCommandManager } from "../../src/commands/manager.js";
import { getSuggestions, getUsageHint } from "../../src/commands/index.js";

function createI18n() {
  return {
    raw: (key) => `raw:${key}`,
    t: (key, values = {}) => {
      if (key === "commands.messages.errorPrefix") return "Error:";
      if (key === "commands.messages.unknownCommand") {
        return `unknown command: /${values.command}`;
      }
      if (key === "commands.errors.usageModelUse") return "Usage: /model";
      return key;
    },
  };
}

test("CommandManager registers commands and executes by name", async () => {
  const manager = new CommandManager();
  manager.register({
    name: "hello",
    descriptionKey: "commands.descriptions.hello",
    execute: async ({ args }) => ({ handled: true, message: args.join(",") }),
  });

  const result = await manager.execute("hello", {
    args: ["one", "two"],
    arg: "one",
    context: { i18n: createI18n() },
    config: {},
    raw: "/hello one two",
  });

  assert.deepEqual(result, { handled: true, message: "one,two" });
});

test("CommandManager rejects duplicate command names", () => {
  const manager = new CommandManager();
  const command = {
    name: "dup",
    descriptionKey: "commands.descriptions.dup",
    execute: async () => ({ handled: true }),
  };

  manager.register(command);
  assert.throws(() => manager.register(command), /Duplicate command: dup/);
});

test("CommandManager returns localized unknown command errors", async () => {
  const manager = new CommandManager();
  const result = await manager.execute("missing", {
    args: [],
    arg: "",
    context: { i18n: createI18n() },
    config: {},
    raw: "/missing",
  });

  assert.deepEqual(result, {
    handled: true,
    message: "Error: unknown command: /missing",
  });
});

test("getSuggestions builds command suggestions from registered commands", () => {
  const suggestions = getSuggestions("/co", createI18n());

  assert.deepEqual(suggestions, [
    {
      label: "/config",
      description: "raw:commands.descriptions.config · /config show",
      complete: "/config ",
      usage: "/config show",
    },
  ]);
});

test("getSuggestions builds static arg suggestions", () => {
  const suggestions = getSuggestions("/think h", createI18n());

  assert.deepEqual(suggestions, [
    {
      label: "high",
      description: "raw:commands.args.high",
      complete: "/think high",
    },
  ]);
});

test("getSuggestions builds positional prompt layer suggestions", () => {
  const suggestions = getSuggestions("/prompt show pr", createI18n());

  assert.deepEqual(suggestions, [
    {
      label: "profile",
      description: "raw:commands.args.promptLayerProfile",
      complete: "/prompt show profile",
    },
    {
      label: "provider",
      description: "raw:commands.args.promptLayerProvider",
      complete: "/prompt show provider",
    },
    {
      label: "project",
      description: "raw:commands.args.promptLayerProject",
      complete: "/prompt show project",
    },
  ]);
});

test("built-in manager exposes all command modules", () => {
  const manager = createCommandManager();

  assert.deepEqual(
    manager.list().map((command) => command.name),
    [
      "think",
      "config",
      "provider",
      "model",
      "profile",
      "prompt",
      "resume",
      "card",
      "usage",
      "update",
      "debug",
      "inittheme",
      "onboard",
      "statusbar",
      "dot",
      "mcp",
    ],
  );
});

test("built-in command suggestions include usage examples for every command", () => {
  const manager = createCommandManager();

  for (const command of manager.list()) {
    assert.equal(typeof command.usage, "string", command.name);
    assert.equal(command.usage.startsWith(`/${command.name}`), true, command.name);
  }
});

test("command suggestions expose usage examples without inserting them", () => {
  const suggestions = getSuggestions("/sta", createI18n());

  assert.deepEqual(suggestions, [
    {
      label: "/statusbar",
      description:
        "raw:commands.descriptions.statusbar · /statusbar {folder} | {model} | {thinking}",
      complete: "/statusbar ",
      usage: "/statusbar {folder} | {model} | {thinking}",
    },
  ]);
});

test("usage hints expose placeholder text without changing command completion", () => {
  assert.deepEqual(getUsageHint("/config"), {
    text: " show",
    usage: "/config show",
  });
  assert.deepEqual(getUsageHint("/config "), {
    text: "show",
    usage: "/config show",
  });
});

test("usage hints disappear after the first argument character", () => {
  assert.equal(getUsageHint("/config s"), null);
  assert.equal(getUsageHint("/config show"), null);
});

test("model command rejects unsupported direct arguments without opening picker", async () => {
  const manager = createCommandManager();
  const result = await manager.execute("model", {
    args: ["use", "gpt-x"],
    arg: "use",
    context: { i18n: createI18n(), runtimeOverrides: {} },
    config: {},
    raw: "/model use gpt-x",
  });

  assert.deepEqual(result, {
    handled: true,
    message: "Error: Usage: /model",
  });
});
