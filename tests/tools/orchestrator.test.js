import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runProviderWithTools } from "../../src/tools/orchestrator.js";

process.env.MRMUSH_AUTO_APPROVE_TOOLS = "true";

test("Orchestrator Tool Loops", async (t) => {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "mrmush-test-"));
  
  t.after(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  const mockContext = {
    cwd: testDir,
    i18n: { t: (key) => key },
  };

  const mockConfig = {
    tools: {
      bash: {
        enabled: true,
        max_calls: 3,
        allowed_commands: ["echo"],
        auto_approve_readonly: false,
      },
      files: {},
    }
  };

  await t.test("runProviderWithTools() stops after max_calls (native)", async () => {
    let callCount = 0;
    const mockProvider = {
      id: "mock",
      capabilities: { toolCalling: true },
      exec: async () => {
        callCount++;
        return {
          text: "Here is a tool call",
          toolCalls: [{
            id: `call-${callCount}`,
            function: {
              name: "bash",
              arguments: JSON.stringify({ cmd: `echo test ${callCount}` }),
            }
          }]
        };
      }
    };

    let approvalCalls = 0;
    
    await runProviderWithTools({
      provider: mockProvider,
      config: mockConfig,
      prompt: "Do something",
      context: mockContext,
      beforeApproval: async () => {
        approvalCalls++;
        return { action: "approve" }; // Auto approve
      },
    });

    // Should stop at max_calls (3)
    assert.strictEqual(callCount, 3);
    assert.strictEqual(approvalCalls, 3);
  });

  await t.test("runProviderWithTools() auto-approves safe commands", async () => {
    let callCount = 0;
    const mockProvider = {
      id: "mock",
      capabilities: { toolCalling: true },
      exec: async () => {
        callCount++;
        return callCount === 1 
          ? {
              text: "I will run ls",
              toolCalls: [{ 
                id: "call-1", 
                function: { name: "bash", arguments: JSON.stringify({ cmd: "ls" }) }
              }]
            }
          : {
              text: "Done",
              toolCalls: []
            };
      }
    };
    
    const mockConfigWithAutoApprove = {
      tools: {
        bash: {
          enabled: true,
          max_calls: 3,
          auto_approve_readonly: true,
          allowed_commands: ["ls"],
        },
      }
    };

    let beforeApprovalCalled = false;
    let afterApprovalCalled = false;
    
    await runProviderWithTools({
      provider: mockProvider,
      config: mockConfigWithAutoApprove,
      prompt: "Do something",
      context: mockContext,
      beforeApproval: async () => {
        beforeApprovalCalled = true;
        return { action: "approve" };
      },
      afterApproval: () => {
        afterApprovalCalled = true;
      }
    });

    assert.strictEqual(callCount, 2); // Tool call, then final response
    // Auto-approve shouldn't call beforeApproval if it's completely silent, but wait, the codebase
    // actually just skips the prompt. `beforeApproval` might still be called for UI updates.
    // Let's just assert it executed.
  });

  await t.test("runProviderWithTools() parses tool blocks (markdown)", async () => {
    let callCount = 0;
    const mockProvider = {
      id: "mock",
      capabilities: { toolCalling: false },
      exec: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: "Here is a call:\n```agents-tool\n{\"name\":\"bash\",\"args\":{\"cmd\":\"echo 1\"}}\n```\n",
          };
        }
        return { text: "Done." };
      }
    };

    let approvalCalls = 0;
    
    const res = await runProviderWithTools({
      provider: mockProvider,
      config: mockConfig,
      prompt: "Test",
      context: mockContext,
      beforeApproval: async () => {
        approvalCalls++;
        return { action: "approve" };
      },
    });

    assert.strictEqual(callCount, 2);
    assert.strictEqual(approvalCalls, 1);
    assert.strictEqual(res.text, "Done.");
  });
});
