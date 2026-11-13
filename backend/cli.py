"""python -m backend.cli examples/demo.sql --data .data/cli"""
import argparse
import json
from pathlib import Path
from .database import Database


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('file', type=Path)
    parser.add_argument('--data', default='.data/cli')
    args = parser.parse_args()
    db = Database(args.data)
    try:
        print(json.dumps(db.execute(args.file.read_text(encoding='utf-8-sig')), ensure_ascii=False, indent=2))
    finally:
        db.close()


if __name__ == '__main__':
    main()
