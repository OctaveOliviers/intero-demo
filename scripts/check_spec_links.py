#!/usr/bin/env python3
"""Link checker for intero/specs.

Scans every Markdown file under SPEC_ROOT, extracts inline links [text](target),
and verifies that each relative-path target resolves to an existing file or
directory. Anchors (#...) are stripped for existence; pure-anchor and external
(http/https/mailto) links are ignored. Exits non-zero if any link is broken.
"""
import os, re, sys

SPEC_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "specs")
SPEC_ROOT = os.path.normpath(SPEC_ROOT)
LINK_RE = re.compile(r'\[[^\]]*\]\(([^)]+)\)')

def is_external(t):
    return t.startswith(("http://", "https://", "mailto:", "tel:"))

broken, checked = [], 0
for dirpath, _dirs, files in os.walk(SPEC_ROOT):
    for fn in files:
        if not fn.endswith(".md"):
            continue
        path = os.path.join(dirpath, fn)
        with open(path, encoding="utf-8") as f:
            for lineno, line in enumerate(f, 1):
                for m in LINK_RE.finditer(line):
                    target = m.group(1).strip()
                    if is_external(target) or target.startswith("#") or not target:
                        continue
                    # strip anchor and any surrounding angle brackets / title
                    target = target.split()[0]
                    target = target.lstrip("<").rstrip(">")
                    path_part = target.split("#", 1)[0]
                    if not path_part:
                        continue
                    checked += 1
                    resolved = os.path.normpath(os.path.join(dirpath, path_part))
                    if not os.path.exists(resolved):
                        rel = os.path.relpath(path, SPEC_ROOT)
                        broken.append((rel, lineno, target))

print(f"checked {checked} relative links across specs")
if broken:
    print(f"\nBROKEN ({len(broken)}):")
    for rel, lineno, target in sorted(broken):
        print(f"  intero/specs/{rel}:{lineno} -> {target}")
    sys.exit(1)
print("OK: no broken internal links")
sys.exit(0)
