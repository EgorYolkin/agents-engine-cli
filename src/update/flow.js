import * as p from "@clack/prompts";
import { APP_VERSION } from "../app-meta.js";
import { getAppPaths, loadState, saveState } from "../config/loader.js";
import { checkForUpdate } from "./checker.js";
import { installUpdate } from "./installer.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function wasRecentlyChecked(state, now = Date.now()) {
  const timestamp = Date.parse(state?.update?.lastCheckedAt ?? "");
  return Number.isFinite(timestamp) && now - timestamp < CHECK_INTERVAL_MS;
}

async function recordUpdateCheck(context, result, now = new Date()) {
  const paths = getAppPaths(context.cwd);
  const state = await loadState(paths);
  await saveState({
    ...state,
    update: {
      ...(state.update ?? {}),
      lastCheckedAt: now.toISOString(),
      latestVersion: result.latestVersion,
      unavailable: result.unavailable,
    },
  }, paths);
}

export async function checkForUpdateWithThrottle(context, { force = false } = {}) {
  const paths = getAppPaths(context.cwd);
  const state = await loadState(paths);

  if (!force && wasRecentlyChecked(state)) {
    return {
      skipped: true,
      available: false,
      currentVersion: context.appVersion ?? APP_VERSION,
      latestVersion: state.update?.latestVersion ?? null,
    };
  }

  const result = await checkForUpdate({
    currentVersion: context.appVersion ?? APP_VERSION,
    force,
  });
  await recordUpdateCheck(context, result);
  return result;
}

export async function promptAndInstallUpdate(context, update) {
  const { i18n } = context;
  const confirmed = await p.confirm({
    message: i18n.t("update.prompts.install", {
      currentVersion: update.currentVersion,
      latestVersion: update.latestVersion,
    }),
    initialValue: true,
  });

  if (p.isCancel(confirmed) || confirmed !== true) {
    return {
      handled: true,
      installed: false,
      message: i18n.t("update.messages.cancelled"),
    };
  }

  const result = await installUpdate();
  return {
    handled: true,
    installed: result.success,
    message: result.success
      ? i18n.t("update.messages.installed")
      : i18n.t("update.messages.installFailed", { code: result.code ?? "unknown" }),
  };
}

export async function runStartupUpdateCheck(context) {
  const update = await checkForUpdateWithThrottle(context);
  if (!update.available) return update;

  const result = await promptAndInstallUpdate(context, update);
  if (result.message) {
    process.stdout.write(`\n${result.message}\n`);
  }
  return {
    ...update,
    install: result,
  };
}

export async function runManualUpdateCommand(context, { install = false } = {}) {
  const { i18n } = context;
  const update = await checkForUpdateWithThrottle(context, { force: true });

  if (update.unavailable) {
    return i18n.t("update.messages.unavailable");
  }

  if (!update.available) {
    return i18n.t("update.messages.current", {
      currentVersion: update.currentVersion,
    });
  }

  if (!install) {
    return i18n.t("update.messages.available", {
      currentVersion: update.currentVersion,
      latestVersion: update.latestVersion,
    });
  }

  const result = await promptAndInstallUpdate(context, update);
  return result.message;
}
