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
        description="Read Markdown text with Korean-friendly encoding fallbacks."
    )
    parser.add_argument("path", help="Markdown file path to read")
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

    path = Path(args.path).expanduser().resolve()
    text, encoding = read_text(path)

    if args.show_encoding:
        print(f"[{encoding}] {path}", file=sys.stderr)

    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
