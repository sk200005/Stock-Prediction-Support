import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

from backend.services.data_loader import load_articles


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT_PYTHON = "/opt/homebrew/opt/python@3.10/bin/python3.10"


def _run_command(command: List[str], environment: Dict[str, str]) -> Dict[str, str]:
    result = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env=environment,
    )
    return {
        "command": " ".join(command),
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "returncode": result.returncode,
    }


def run_news_pipeline() -> Dict[str, object]:
    articles_before = load_articles()
    environment = os.environ.copy()
    project_python = environment.get("PROJECT_PYTHON_BIN") or environment.get("PYTHON_ANALYZER_BIN")
    if not project_python:
        project_python = DEFAULT_PROJECT_PYTHON if Path(DEFAULT_PROJECT_PYTHON).exists() else sys.executable

    environment["PROJECT_PYTHON_BIN"] = project_python
    environment["PYTHON_ANALYZER_BIN"] = environment.get("PYTHON_ANALYZER_BIN") or project_python

    commands = [["node", "index.js"]]

    logs = []
    for command in commands:
        result = _run_command(command, environment)
        logs.append(result)
        if result["returncode"] != 0:
            raise RuntimeError(
                f"Pipeline step failed: {result['command']}\n{result['stderr'] or result['stdout']}"
            )

    articles_after = load_articles()
    new_articles_added = max(0, len(articles_after) - len(articles_before))

    if new_articles_added > 0:
        message = f"{new_articles_added} new analyzed articles added."
    else:
        message = "No new unseen articles were found in the latest feed fetch."

    return {
        "success": True,
        "logs": logs,
        "new_articles_added": new_articles_added,
        "total_articles": len(articles_after),
        "message": message,
    }
