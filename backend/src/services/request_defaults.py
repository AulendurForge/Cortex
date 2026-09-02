"""Helpers for the per-model request defaults (Plane C).

``Model.request_defaults_json`` is the single source of truth for the sampling
parameters the gateway merges into every request (temperature, top_p, ...)
plus arbitrary custom extras (``vllm_xargs``, ``stop``, ...).  The admin API
exposes the sampling knobs as individual fields and the extras as an editable
JSON blob (``custom_request_json``); these helpers convert between the two
representations without losing either side.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Mapping

logger = logging.getLogger(__name__)

# The six OpenAI-style sampling knobs that get their own form fields / columns.
SAMPLING_FIELDS: tuple[str, ...] = (
    "temperature",
    "top_p",
    "top_k",
    "repetition_penalty",
    "frequency_penalty",
    "presence_penalty",
)


def split_request_defaults(raw: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Split ``request_defaults_json`` into ``(sampling, extras)`` dicts.

    Malformed or empty input yields two empty dicts.
    """
    if not raw or not str(raw).strip():
        return {}, {}
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("Ignoring malformed request_defaults_json: %r", raw[:200] if isinstance(raw, str) else raw)
        return {}, {}
    if not isinstance(data, dict):
        return {}, {}
    sampling = {k: v for k, v in data.items() if k in SAMPLING_FIELDS}
    extras = {k: v for k, v in data.items() if k not in SAMPLING_FIELDS}
    return sampling, extras


def build_request_defaults_json(
    sampling: Mapping[str, Any],
    custom_json: str | None,
    existing_json: str | None = None,
    *,
    clear_none: bool = False,
) -> str | None:
    """Merge sampling fields and custom extras into a ``request_defaults_json`` string.

    Args:
        sampling: sampling field -> value.  ``None`` values are ignored unless
            ``clear_none`` is set, in which case they remove the key.
        custom_json: JSON object of custom extras.  ``None`` or blank means
            "leave the existing extras unchanged"; a valid JSON object replaces
            them; invalid JSON is logged and ignored.
        existing_json: the current stored value, used as the base so partial
            updates keep everything they did not mention.
        clear_none: treat ``None`` sampling values as explicit removals (PATCH).

    Returns:
        The merged JSON string, or ``None`` when nothing is set.
    """
    base_sampling, base_extras = split_request_defaults(existing_json)

    for key, value in (sampling or {}).items():
        if key not in SAMPLING_FIELDS:
            continue
        if value is None:
            if clear_none:
                base_sampling.pop(key, None)
            continue
        base_sampling[key] = value

    if custom_json is not None and str(custom_json).strip():
        try:
            parsed = json.loads(custom_json)
        except (TypeError, ValueError):
            logger.warning("Ignoring invalid custom_request_json: %r", str(custom_json)[:200])
        else:
            if isinstance(parsed, dict):
                base_extras = {}
                for key, value in parsed.items():
                    # Sampling knobs typed into the custom JSON still land in the
                    # sampling side so the form fields reflect them.
                    if key in SAMPLING_FIELDS:
                        base_sampling[key] = value
                    else:
                        base_extras[key] = value
            else:
                logger.warning("custom_request_json must be a JSON object; ignoring %r", str(custom_json)[:200])

    merged: dict[str, Any] = {**base_extras, **base_sampling}
    return json.dumps(merged) if merged else None
