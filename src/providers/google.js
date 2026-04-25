export const googleProvider = {
  id: "google",
  labelKey: "providers.google.label",
  source: "api",
  binary: "node",
  defaultModel: "gemini-2.5-pro",
  capabilities: { toolCalling: true },

  getAuthRequirements(resolvedConfig) {
    return resolvedConfig.auth.google;
  },

  async fetchModels(resolvedConfig = null) {
    const envKey = resolvedConfig?.auth?.google?.env_key ?? "GEMINI_API_KEY";
    const i18n = resolvedConfig?.i18n ?? null;
    const apiKey = resolvedConfig?.auth?.google?.api_key ?? process.env[envKey];
    if (!apiKey) {
      const message = i18n
        ? i18n.t("providers.google.missingEnv", { envKey })
        : `Environment variable ${envKey} is not set`;
      throw new Error(message);
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }

    const { models } = await res.json();

    return models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => {
        const id = m.name.replace("models/", "");
        return { value: id, label: id };
      });
  },

  async exec(resolvedConfig, prompt, runtimeOverrides = {}, signal = null, options = {}) {
    const model = runtimeOverrides.model ?? resolvedConfig.activeModel;
    const envKey = resolvedConfig.auth.google.env_key;
    const apiKey = resolvedConfig.auth.google.api_key ?? process.env[envKey];
    if (!apiKey) {
      throw new Error(
        resolvedConfig.i18n.t("providers.google.missingEnv", { envKey }),
      );
    }

    const stream = typeof options.onToken === "function";
    const method = stream ? "streamGenerateContent" : "generateContent";
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`,
    );
    url.searchParams.set("key", apiKey);
    if (stream) url.searchParams.set("alt", "sse");

    let contents;
    let systemInstruction;

    if (options.messages?.length) {
      // Convert multi-turn messages (including tool results) to Gemini format.
      const nonSystem = options.messages.filter((m) => m.role !== "system");
      const systemMsg = options.messages.find((m) => m.role === "system");
      if (systemMsg) {
        systemInstruction = { parts: [{ text: systemMsg.content }] };
      }
      contents = nonSystem.map((m) => {
        // Tool result message: { role: "tool", content: functionResponse }
        if (m.role === "tool") {
          return {
            role: "user",
            parts: [m.content],
          };
        }
        // Assistant message with function calls
        if (m.role === "assistant" && m.toolCalls?.length) {
          return {
            role: "model",
            parts: m.toolCalls.map((tc) => ({ functionCall: { name: tc.name, args: tc.args } })),
          };
        }
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content ?? "" }],
        };
      });
    } else {
      if (resolvedConfig.promptStack?.text) {
        systemInstruction = { parts: [{ text: resolvedConfig.promptStack.text }] };
      }
      contents = [{ role: "user", parts: [{ text: prompt }] }];
    }

    const requestBody = {
      ...(systemInstruction ? { systemInstruction } : {}),
      contents,
      ...(options.tools ? { tools: [options.tools] } : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `Google Gemini: HTTP ${res.status}`);
    }

    if (!stream) {
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? "").join("");
      const toolCalls = parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({
          name: p.functionCall.name,
          args: p.functionCall.args ?? {},
          id: `gemini-call-${i}`,
        }));
      return { text, usage: data.usageMetadata ?? null, toolCalls };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let usage = null;
    const toolCalls = [];

    function readEvent(line) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;

      const payload = trimmed.slice("data:".length).trim();
      if (!payload) return;

      const event = JSON.parse(payload);
      const parts = event.candidates?.[0]?.content?.parts ?? [];

      for (const part of parts) {
        if (part.text) {
          text += part.text;
          options.onToken(part.text);
        }
        if (part.functionCall) {
          toolCalls.push({
            name: part.functionCall.name,
            args: part.functionCall.args ?? {},
            id: `gemini-call-${toolCalls.length}`,
          });
        }
      }
      usage = event.usageMetadata ?? usage;
    }

    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          readEvent(line);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        readEvent(buffer);
      }
    } catch (err) {
      if (err.name === "AbortError") throw new Error("cancelled");
      throw err;
    }

    return { text, usage, toolCalls };
  },
};
