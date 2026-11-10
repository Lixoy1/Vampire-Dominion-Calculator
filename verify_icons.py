#!/usr/bin/env python3
"""Verify bundled original WebP assets against icon_path entries in js/data.js.
Run from the project root: python verify_icons.py
"""
import re, struct
from pathlib import Path
root = Path(__file__).parent
text = (root / "js/data.js").read_text(encoding="utf-8")
paths = sorted(set(re.findall(r'"icon_path(?:_[a-z]+)?":\s*"([^"]+\.webp)"', text)))
missing, invalid = [], []
for rel in paths:
    p = root / "assets" / "icons" / rel
    if not p.is_file():
        missing.append(rel); continue
    b = p.read_bytes()[:12]
    if len(b) < 12 or b[:4] != b"RIFF" or b[8:12] != b"WEBP": invalid.append(rel)
print(f"Referenced icons: {len(paths)}")
print(f"Valid local WebP: {len(paths)-len(missing)-len(invalid)}")
if missing: print("Missing:\n" + "\n".join(missing))
if invalid: print("Invalid:\n" + "\n".join(invalid))
raise SystemExit(1 if missing or invalid else 0)