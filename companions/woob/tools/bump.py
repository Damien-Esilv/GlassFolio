"""Weekly Woob bump helper (TGLA-241), run by .github/workflows/woob-bump.yml. Standard library + packaging.

    python bump.py pin <woob-source.json> <sha>          points the pin at a commit (date from the GitLab API)
    python bump.py check <woob source tree> <requirements.in> <requirements.lock>
        fails when Woob or one of its bank modules needs a package, or a version, the lock does not provide
"""

from __future__ import annotations

import json
import re
import sys
import tomllib
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from glassfolio_woob.catalog import bank_module_closure  # noqa: E402

COMMIT_API = "https://gitlab.com/api/v4/projects/woob%2Fwoob/repository/commits/{sha}"
#: Requirements of bank modules GlassFolio knowingly does not satisfy (the module is then simply not offered)
KNOWN_UNMET = {
    "jwt",  # apivie declares the "jwt" distribution, not PyJWT
}


def normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def pin(source_file: str, sha: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise SystemExit(f"not a commit: {sha}")
    with urllib.request.urlopen(COMMIT_API.format(sha=sha), timeout=30) as response:  # noqa: S310 - fixed https URL
        date = json.load(response)["committed_date"][:10]
    path = Path(source_file)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["commit"], data["date"] = sha, date
    path.write_text(json.dumps(data, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Woob pinned to {sha} ({date})")


def requirements_of(source: Path) -> list[str]:
    """Requirement lines of Woob itself and of every shipped bank module (woob itself excluded)."""
    lines = list(tomllib.loads((source / "pyproject.toml").read_text(encoding="utf-8"))["project"]["dependencies"])
    for name in bank_module_closure(source / "modules"):
        file = source / "modules" / name / "requirements.txt"
        if file.exists():
            lines += [line.strip() for line in file.read_text(encoding="utf-8").splitlines() if line.strip() and not line.startswith("#")]
    return [line for line in lines if normalize(re.split(r"[<>=~!; \[]", line)[0]) != "woob"]


def check(source_dir: str, requirements_in: str, lock_file: str) -> None:
    from packaging.requirements import Requirement

    locked = {
        normalize(match.group(1)): match.group(2)
        for match in re.finditer(r"^([A-Za-z0-9_.\-]+)==([^\s\;]+)", Path(lock_file).read_text(encoding="utf-8"), re.M)
    }
    wanted = {normalize(re.split(r"[<>=~!; \[]", line.strip())[0]) for line in Path(requirements_in).read_text(encoding="utf-8").splitlines()
              if line.strip() and not line.startswith("#")}
    problems = []
    for line in requirements_of(Path(source_dir)):
        requirement = Requirement(line)
        name = normalize(requirement.name)
        if name in KNOWN_UNMET:
            continue
        if name not in locked:
            problems.append(f"{line}: not in requirements.lock" + ("" if name in wanted else " (add it to requirements.in)"))
        elif requirement.specifier and not requirement.specifier.contains(locked[name], prereleases=True):
            # Selenium < 4.1.4 of three browser-driven modules is a known, accepted gap (those banks are not offered)
            if not (name == "selenium" and str(requirement.specifier) == "<4.1.4"):
                problems.append(f"{line}: the lock has {locked[name]}")
    if problems:
        print("Woob needs packages the lock does not provide:\n  " + "\n  ".join(sorted(set(problems))))
        print("Update companions/woob/requirements.in, relock (uv pip compile --universal --generate-hashes) and check the wheels.")
        raise SystemExit(1)
    print("Every requirement of Woob and of its bank modules is in the lock.")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "pin":
        pin(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 5 and sys.argv[1] == "check":
        check(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        raise SystemExit(__doc__)
