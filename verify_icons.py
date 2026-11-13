#!/usr/bin/env python3
"""Verify all local WebP assets referenced by the canonical HAR-reconciled catalog."""
import json
from pathlib import Path

root = Path(__file__).parent
data = json.loads((root / "data" / "vampire-dominion-data.json").read_text(encoding="utf-8"))
paths = set()

def walk(value):
    if isinstance(value, list):
        for child in value:
            walk(child)
    elif isinstance(value, dict):
        for key, child in value.items():
            if key.startswith("icon_path") and isinstance(child, str) and child.endswith(".webp"):
                paths.add(child)
            else:
                walk(child)

walk(data["catalog"])
missing, invalid = [], []
for rel in sorted(paths):
    path = root / "assets" / "icons" / rel
    if not path.is_file():
        missing.append(rel)
        continue
    header = path.read_bytes()[:12]
    if len(header) < 12 or header[:4] != b"RIFF" or header[8:12] != b"WEBP":
        invalid.append(rel)

print(f"Referenced icons: {len(paths)}")
print(f"Valid local WebP: {len(paths) - len(missing) - len(invalid)}")
if missing:
    print("Missing:\n" + "\n".join(missing))
if invalid:
    print("Invalid:\n" + "\n".join(invalid))
raise SystemExit(1 if missing or invalid else 0)
