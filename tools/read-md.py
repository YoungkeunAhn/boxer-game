#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path


ENCODINGS = (
    "utf-8-sig",
    "utf-16",
    "utf-8",
    "cp949",
    "euc_kr",
)


def read_text(path: Path) -> tuple[str, str]:
    data = path.read_bytes()

    for encoding in ENCODINGS:
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            continue

    tried = ", ".join(ENCODINGS)
    raise UnicodeError(f"Could not decode {path} with: {tried}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read text files with Korean-friendly encoding fallbacks."
    )
    parser.add_argument("paths", nargs="+", help="File path(s) to read")
    parser.add_argument(
        "--show-encoding",
        action="store_true",
        help="Print the selected encoding to stderr",
    )
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    multiple_paths = len(args.paths) > 1
    failed = False
    wrote_output = False

    for raw_path in args.paths:
        path = Path(raw_path).expanduser().resolve()

        try:
            contents, encoding = read_text(path)
        except (OSError, UnicodeError) as error:
            print(f"[read-md] 읽기 실패: {path}: {error}", file=sys.stderr)
            failed = True
            continue

        if args.show_encoding:
            print(f"[{encoding}] {path}", file=sys.stderr)

        if multiple_paths:
            if wrote_output:
                sys.stdout.write("\n")
            sys.stdout.write(f"===== {path} [{encoding}] =====\n")

        sys.stdout.write(contents)
        wrote_output = True
        if multiple_paths and not contents.endswith("\n"):
            sys.stdout.write("\n")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
