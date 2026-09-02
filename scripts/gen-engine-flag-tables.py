#!/usr/bin/env python3
"""Regenerate the flag tables in docs/models/vllm.md and docs/models/llamaCPP.md from
backend/src/engines/spec.py, so the docs cannot drift from what the gateway emits.

    python3 scripts/gen-engine-flag-tables.py          # rewrite both docs in place
    python3 scripts/gen-engine-flag-tables.py --check  # exit 1 if the docs are stale

The docs contain marker comments; only the text between them is replaced:
    <!-- BEGIN GENERATED: vllm -->  ...  <!-- END GENERATED -->
    <!-- BEGIN GENERATED: common --> / <!-- BEGIN GENERATED: llamacpp -->
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from src.engines.spec import COMMON_FIELDS, GROUPS, LLAMACPP_FIELDS, VLLM_FIELDS, FieldSpec  # noqa: E402

DOCS = {
    ROOT / "docs/models/vllm.md": {"common": ("vllm", COMMON_FIELDS), "vllm": ("vllm", VLLM_FIELDS)},
    ROOT / "docs/models/llamaCPP.md": {"common": ("llamacpp", COMMON_FIELDS), "llamacpp": ("llamacpp", LLAMACPP_FIELDS)},
}


def fmt_default(d) -> str:
    if d is None:
        return "engine default"
    if isinstance(d, bool):
        return "on" if d else "off"
    return f"`{d}`"


def fmt_flag(f: FieldSpec, engine: str) -> str:
    fl = f.flag_for(engine)
    if f.form == "env":
        return f"env `{f.env}`" + (f"=`{f.env_value}`" if f.env_value else "")
    if f.form == "internal":
        return "(Cortex-internal, not a flag)"
    if f.form == "negatable":
        return f"`{fl}` / `--no-{fl[2:]}`"
    if f.form == "no_only":
        return f"`--no-{fl[2:]}` when off"
    if f.form == "onoff":
        return f"`{fl} on|off`"
    if f.form == "csv":
        return f"`{fl} a b c` (comma list)"
    if f.form == "json":
        return f"`{fl} '{{...}}'`"
    if f.form == "custom":
        return f"`{fl}` (repeated)"
    if f.form == "switch":
        return f"`{fl}`"
    return f"`{fl} VALUE`"


def render(fields: tuple[FieldSpec, ...], engine: str) -> str:
    out: list[str] = []
    for key, label in GROUPS:
        fs = sorted((f for f in fields if f.group == key and f.applies_to(engine)), key=lambda f: f.order)
        if not fs:
            continue
        out.append(f"\n#### {label}\n")
        out.append("| Field (API / form) | Flag | Meaning | Default | Choices / range |")
        out.append("|---|---|---|---|---|")
        for f in fs:
            choices = ", ".join(f"`{c}`" for c in f.choices) if f.choices else ""
            rng = []
            if f.min is not None:
                rng.append(f"min {f.min}")
            if f.max is not None:
                rng.append(f"max {f.max}")
            if rng:
                choices = (choices + " " if choices else "") + "(" + ", ".join(rng) + ")"
            meaning = f.label + (". " + f.help if f.help else "")
            if f.emit_if == "gt1":
                meaning += " Emitted only when > 1."
            if f.emit_if == "gt0":
                meaning += " Emitted only when > 0."
            if f.path:
                meaning += " Path relative to the models dir (mounted at `/models`)."
            if f.requires:
                meaning += " Requires " + ", ".join(f"`{k}={v}`" for k, v in f.requires.items()) + "."
            meaning = meaning.replace("|", "\\|")
            out.append(f"| `{f.name}` | {fmt_flag(f, engine)} | {meaning} | {fmt_default(f.default)} | {choices} |")
    out.append("")
    return "\n".join(out)


def main() -> int:
    check = "--check" in sys.argv
    stale = False
    for path, sections in DOCS.items():
        text = path.read_text()
        new = text
        for name, (engine, fields) in sections.items():
            pattern = re.compile(rf"(<!-- BEGIN GENERATED: {name} -->\n).*?(<!-- END GENERATED -->)", re.S)
            if not pattern.search(new):
                print(f"{path}: missing markers for '{name}'", file=sys.stderr)
                return 2
            new = pattern.sub(lambda m: m.group(1) + render(fields, engine) + m.group(2), new)
        if new != text:
            stale = True
            if check:
                print(f"stale: {path}")
            else:
                path.write_text(new)
                print(f"updated: {path}")
    if check and stale:
        return 1
    if check:
        print("engine flag tables are up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
