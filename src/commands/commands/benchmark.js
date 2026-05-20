import fs from "node:fs/promises";
import path from "node:path";
import { successResult, errorResult } from "../results.js";
import { runBenchmark, summarizeResults, formatReport } from "../../experiments/benchmark.js";

export const benchmarkCommand = {
  name: "benchmark",
  descriptionKey: "commands.descriptions.benchmark",
  usage: "/benchmark",
  args: [],
  async execute({ context }) {
    try {
      const progressLines = [];
      const results = await runBenchmark(context.config, context.runtimeOverrides, {
        onProgress: (msg) => {
          progressLines.push(msg);
          process.stderr.write(`[bench] ${msg}\n`);
        },
      });
      const summary = summarizeResults(results);
      const report = formatReport(results, summary);

      // Save to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const benchDir = path.join(context.cwd, ".mrmush", "benchmarks");
      await fs.mkdir(benchDir, { recursive: true });
      const filePath = path.join(benchDir, `paraphrase-${timestamp}.txt`);
      await fs.writeFile(filePath, report, "utf8");

      return successResult(report + `\n\n  Saved to: ${filePath}`);
    } catch (err) {
      process.stderr.write(`[bench] ERROR: ${err.message}\n`);
      return errorResult(`Benchmark failed: ${err.message}`);
    }
  },
};
