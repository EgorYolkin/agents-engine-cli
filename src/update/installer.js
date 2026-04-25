import { spawn } from "node:child_process";
import { INSTALL_SOURCE } from "./checker.js";

export const INSTALL_COMMAND = "npm";
export const INSTALL_ARGS = ["install", "-g", INSTALL_SOURCE];

export async function installUpdate({ spawnImpl = spawn } = {}) {
  const child = spawnImpl(INSTALL_COMMAND, INSTALL_ARGS, {
    stdio: "inherit",
    shell: false,
  });

  return new Promise((resolve) => {
    child.on("close", (code) => {
      resolve({
        success: code === 0,
        code,
      });
    });
    child.on("error", (error) => {
      resolve({
        success: false,
        code: null,
        error,
      });
    });
  });
}
