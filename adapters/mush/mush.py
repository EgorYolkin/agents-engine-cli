import json
import os
import shlex
from pathlib import Path

from harbor.agents.installed.base import (
    BaseInstalledAgent,
    CliFlag,
    EnvVar,
    with_prompt_template,
)
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.trial.paths import EnvironmentPaths

# Path to the local mush project root
MUSH_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Mush(BaseInstalledAgent):
    """Harbor adapter for the Mush coding agent."""

    SUPPORTS_ATIF: bool = False

    CLI_FLAGS = [
        CliFlag(
            "thinking_level",
            cli="--thinking",
            type="enum",
            choices=["off", "minimal", "low", "medium", "high", "xhigh"],
        ),
    ]

    ENV_VARS = [
        EnvVar(
            "api_key",
            env="XIAOMIMIMO_API_KEY",
        ),
    ]

    @staticmethod
    def name() -> str:
        return "mush"

    def version(self) -> str | None:
        return self._version

    def get_version_command(self) -> str | None:
        return "node /opt/mush/bin/mr-mush-harbor.js --version"

    def parse_version(self, stdout: str) -> str:
        return stdout.strip()

    async def install(self, environment: BaseEnvironment) -> None:
        # Install curl and tar first
        await self.exec_as_root(
            environment,
            command=(
                "if command -v apk &> /dev/null; then"
                "  apk add --no-cache curl bash git tar;"
                " elif command -v apt-get &> /dev/null; then"
                "  apt-get update && apt-get install -y curl bash git tar;"
                " elif command -v yum &> /dev/null; then"
                "  yum install -y curl bash git tar;"
                " else"
                '  echo "Warning: No known package manager found" >&2;'
                " fi"
            ),
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )

        # Install Node.js 22 via NodeSource (newer than container default)
        await self.exec_as_root(
            environment,
            command=(
                "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && "
                "apt-get install -y nodejs 2>/dev/null || "
                "({ curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && "
                "yum install -y nodejs; }) 2>/dev/null || "
                "echo 'Node.js install fallback'"
            ),
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )

        # Create tarball of the mush project locally
        import subprocess
        import tempfile

        tarball_path = Path(tempfile.mktemp(suffix=".tar.gz"))
        try:
            # Create tarball excluding node_modules, .git, etc.
            subprocess.run(
                [
                    "tar", "-czf", str(tarball_path),
                    "-C", str(MUSH_PROJECT_ROOT),
                    "--exclude=node_modules",
                    "--exclude=.git",
                    "--exclude=.mrmush",
                    "--exclude=.mush",
                    "--exclude=.omx",
                    "--exclude=.planning",
                    "--exclude=.venv",
                    "--exclude=jobs",
                    "--exclude=tests",
                    "--exclude=.DS_Store",
                    "--exclude=*.pyc",
                    "--exclude=__pycache__",
                    "--exclude=adapters",
                    "."
                ],
                check=True,
                capture_output=True,
            )

            # Upload tarball to container
            await environment.upload_file(str(tarball_path), "/tmp/mush.tar.gz")
        finally:
            tarball_path.unlink(missing_ok=True)

        # Extract and install
        await self.exec_as_root(
            environment,
            command=(
                "mkdir -p /opt/mush && "
                "cd /opt/mush && "
                "tar -xzf /tmp/mush.tar.gz && "
                "rm /tmp/mush.tar.gz && "
                "chown -R $(id -u):$(id -g) /opt/mush"
            ),
        )

        # Install dependencies with newer npm
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail; "
                "cd /opt/mush && "
                "npm install --omit=dev 2>&1 || npm install --production 2>&1; "
                "ln -sf /opt/mush/bin/mr-mush-harbor.js /usr/local/bin/mr-mush-harbor && "
                "ln -sf /opt/mush/bin/mr-mush.js /usr/local/bin/mr-mush && "
                "ln -sf /opt/mush/bin/mush.js /usr/local/bin/mush && "
                "chmod +x /opt/mush/bin/*.js && "
                "node /opt/mush/bin/mr-mush-harbor.js --version"
            ),
        )

    @with_prompt_template
    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        escaped_instruction = shlex.quote(instruction)

        env = {
            "XIAOMIMIMO_API_KEY": self._get_env("XIAOMIMIMO_API_KEY") or "",
            "MRMUSH_AUTO_APPROVE_TOOLS": "1",
        }

        cli_flags = self.build_cli_flags()
        extra_flags = (cli_flags + " ") if cli_flags else ""

        await self.exec_as_agent(
            environment,
            command=(
                f"mr-mush-harbor "
                f"--instruction {escaped_instruction} "
                f"--provider xiaomimimo "
                f"--model mimo-v2.5 "
                f"{extra_flags}"
                f"--cwd /app "
                f"2>&1 </dev/null | tee "
                f"{EnvironmentPaths.agent_dir / 'mush.txt'}"
            ),
            env=env,
        )

    def populate_context_post_run(self, context: AgentContext) -> None:
        log_path = self.logs_dir / "mush.txt"
        if not log_path.exists():
            self.logger.debug("No mush log file found")
            return

        try:
            content = log_path.read_text(encoding="utf-8")
            if content.strip():
                self.logger.debug(f"Mush completed, output length: {len(content)}")
        except OSError as exc:
            self.logger.debug(f"Failed to read mush log: {exc}")
