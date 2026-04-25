export const REMOTE_PACKAGE_URL =
  "https://raw.githubusercontent.com/EgorYolkin/mr-mush-cli/main/package.json";

export const INSTALL_SOURCE =
  "git+https://github.com/EgorYolkin/mr-mush-cli.git";

const FETCH_TIMEOUT_MS = 3000;

function parseVersion(version) {
  const match = String(version ?? "").trim().match(
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) return null;

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareIdentifiers(left, right) {
  const leftNumber = /^\d+$/.test(left) ? Number.parseInt(left, 10) : null;
  const rightNumber = /^\d+$/.test(right) ? Number.parseInt(right, 10) : null;

  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right);
}

export function compareVersions(current, remote) {
  const currentParsed = parseVersion(current);
  const remoteParsed = parseVersion(remote);
  if (!currentParsed || !remoteParsed) return 0;

  for (const key of ["major", "minor", "patch"]) {
    const diff = remoteParsed[key] - currentParsed[key];
    if (diff !== 0) return diff;
  }

  const currentPre = currentParsed.prerelease;
  const remotePre = remoteParsed.prerelease;
  if (currentPre.length === 0 && remotePre.length === 0) return 0;
  if (currentPre.length === 0) return -1;
  if (remotePre.length === 0) return 1;

  const maxLength = Math.max(currentPre.length, remotePre.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (currentPre[index] === undefined) return 1;
    if (remotePre[index] === undefined) return -1;
    const diff = compareIdentifiers(remotePre[index], currentPre[index]);
    if (diff !== 0) return diff;
  }

  return 0;
}

export async function fetchRemotePackage({
  fetchImpl = globalThis.fetch,
  packageUrl = REMOTE_PACKAGE_URL,
  timeoutMs = FETCH_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable in this runtime");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(packageUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`update check failed with HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkForUpdate({
  currentVersion,
  force = false,
  fetchImpl,
  packageUrl,
} = {}) {
  try {
    const remotePackage = await fetchRemotePackage({ fetchImpl, packageUrl });
    const latestVersion = remotePackage?.version;
    if (!latestVersion || typeof latestVersion !== "string") {
      return {
        available: false,
        unavailable: true,
        reason: "missing-version",
        currentVersion,
        latestVersion: null,
        installSource: INSTALL_SOURCE,
        force,
      };
    }

    return {
      available: compareVersions(currentVersion, latestVersion) > 0,
      unavailable: false,
      currentVersion,
      latestVersion,
      installSource: INSTALL_SOURCE,
      force,
    };
  } catch (error) {
    return {
      available: false,
      unavailable: true,
      reason: error?.message ?? "update-check-failed",
      currentVersion,
      latestVersion: null,
      installSource: INSTALL_SOURCE,
      force,
    };
  }
}
