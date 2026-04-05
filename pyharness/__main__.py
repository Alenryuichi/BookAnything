"""CLI entry point: python -m pyharness {run,init}"""

from dotenv import load_dotenv
load_dotenv()

import argparse
import asyncio
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="pyharness",
        description="源码书籍生成 Harness (Python)",
    )
    sub = parser.add_subparsers(dest="command")

    # ── run ──
    run_parser = sub.add_parser("run", help="Run the harness loop")
    run_parser.add_argument(
        "--project",
        default="projects/claude-code.yaml",
        help="Project config file (default: projects/claude-code.yaml)",
    )
    run_parser.add_argument("--max-hours", type=float, default=12, help="Max runtime in hours (default: 12)")
    run_parser.add_argument("--threshold", type=int, default=85, help="Pass score threshold (default: 85)")
    run_parser.add_argument("--max-parallel", type=int, default=3, help="Max parallel chapter writes (default: 3)")
    run_parser.add_argument("--resume", action="store_true", help="Resume from previous state")

    # ── init ──
    init_parser = sub.add_parser("init", help="Initialize a new project config from a repo")
    init_parser.add_argument(
        "repo_path",
        type=Path,
        help="Path to the target repository",
    )

    args = parser.parse_args()

    if args.command == "run":
        from pyharness.config import load_project_config
        from pyharness.runner import HarnessRunner

        project_path = Path(args.project)
        if not project_path.exists():
            print(f"ERROR: Project file not found: {project_path}", file=sys.stderr)
            sys.exit(1)

        config = load_project_config(project_path)
        runner = HarnessRunner(
            config=config,
            max_hours=args.max_hours,
            threshold=args.threshold,
            max_parallel=args.max_parallel,
            resume=args.resume,
        )
        asyncio.run(runner.run())

    elif args.command == "init":
        from pyharness.init import init_project

        repo = args.repo_path.resolve()
        if not repo.is_dir():
            print("ERROR: 仓库路径不存在", file=sys.stderr)
            sys.exit(1)

        asyncio.run(init_project(repo))

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
