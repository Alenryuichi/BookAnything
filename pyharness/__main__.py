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
    run_parser.add_argument("--max-iterations", type=int, default=0, help="Max iterations (0=unlimited, default: 0)")
    run_parser.add_argument("--resume", action="store_true", help="Resume from previous state")
    run_parser.add_argument("--log-sink", type=Path, default=None, help="Path to JSON-lines log sink file for SSE streaming")
    run_parser.add_argument("--quick", action="store_true", default=False, help="Quick mode: skip review/improve/visual-test phases, 1 iteration")
    run_parser.add_argument("--control-file", type=Path, default=None, help="Path to command file for interactive control")

    # ── init ──
    init_parser = sub.add_parser("init", help="Initialize a new project config from a repo")
    init_parser.add_argument(
        "repo_path",
        type=Path,
        help="Path to the target repository",
    )
    init_parser.add_argument("--log-sink", type=Path, default=None, help="Path to JSON-lines log sink file for SSE streaming")

    # ── write ──
    write_parser = sub.add_parser("write", help="Write a single chapter directly")
    write_parser.add_argument(
        "--project",
        required=True,
        help="Project config file (e.g. projects/claude-code.yaml)",
    )
    write_parser.add_argument(
        "--chapter",
        required=True,
        help="Chapter ID to write (e.g. ch01-overview)",
    )

    args = parser.parse_args()

    if args.command == "run":
        from pyharness.config import load_project_config
        from pyharness.runner import HarnessRunner

        project_path = Path(args.project)
        if not project_path.exists():
            print(f"ERROR: Project file not found: {project_path}", file=sys.stderr)
            sys.exit(1)

        if args.quick:
            explicit_flags = {a.dest for a in run_parser._actions if any(o in sys.argv for o in a.option_strings)}
            if "max_iterations" not in explicit_flags:
                args.max_iterations = 1
            if "threshold" not in explicit_flags:
                args.threshold = 0

        config = load_project_config(project_path)
        runner = HarnessRunner(
            config=config,
            max_hours=args.max_hours,
            threshold=args.threshold,
            max_parallel=args.max_parallel,
            resume=args.resume,
            max_iterations=args.max_iterations,
            log_sink=args.log_sink,
            quick_mode=args.quick,
            control_file=args.control_file,
        )
        asyncio.run(runner.run())

    elif args.command == "init":
        from pyharness.init import init_project

        repo = args.repo_path.resolve()
        if not repo.is_dir():
            print("ERROR: 仓库路径不存在", file=sys.stderr)
            sys.exit(1)

        if args.log_sink:
            from pyharness.log import init_sink
            init_sink(args.log_sink)

        asyncio.run(init_project(repo))

    elif args.command == "write":
        from pyharness.config import load_project_config
        from pyharness.runner import HarnessRunner
        from pyharness.phases.write import step_write_chapters

        project_path = Path(args.project)
        if not project_path.exists():
            print(f"ERROR: Project file not found: {project_path}", file=sys.stderr)
            sys.exit(1)

        config = load_project_config(project_path)
        runner = HarnessRunner(config=config)
        runner.chapters_dir.mkdir(parents=True, exist_ok=True)
        asyncio.run(step_write_chapters(runner, 0, None, single_chapter_id=args.chapter))

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
