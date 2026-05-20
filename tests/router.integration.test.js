import test from "node:test";
import assert from "node:assert";

test("Router integration tests", async (t) => {
  let setupCalled = false;
  let chatCalled = false;

  const { Router } = await import("../src/router.js");

  // We can't easily mock ESM imports without loader flags in Node 22. 
  // Let's just instantiate Router and test its state initialization.
  const context = {
    cwd: "/tmp",
    currentScene: "boot",
    i18n: { t: (key) => key },
    runSetupScreen: async () => {
      setupCalled = true;
      return {};
    },
    runChatScreen: async () => {
      chatCalled = true;
    },
  };
  const ui = {};
  const router = new Router(context, ui);
  
  assert.strictEqual(router.currentScene, "boot");
  assert.strictEqual(router.context, context);
  assert.strictEqual(router.ui, ui);

  await router.navigate("setup");
  assert.strictEqual(router.currentScene, "chat");
  assert.strictEqual(setupCalled, true);
});
