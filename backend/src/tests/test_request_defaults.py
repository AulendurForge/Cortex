"""Unit tests for request_defaults_json handling (Plane C).

request_defaults_json is the single source of truth for per-request sampling
defaults plus arbitrary custom extras (vllm_xargs, stop, ...).  The API must be
able to build it from form fields, split it back into form fields, and merge
partial updates without losing the extras.
"""
from __future__ import annotations

import json

import pytest

from src.services.request_defaults import (
    SAMPLING_FIELDS,
    build_request_defaults_json,
    split_request_defaults,
)
from src.routes.openai import merge_request_defaults


def test_sampling_fields_are_the_six_openai_knobs():
    assert set(SAMPLING_FIELDS) == {
        "temperature", "top_p", "top_k", "repetition_penalty", "frequency_penalty", "presence_penalty",
    }


def test_build_from_sampling_and_custom_json():
    out = build_request_defaults_json(
        {"temperature": 0.3, "top_k": None, "top_p": 0.5},
        custom_json=json.dumps({"stop": ["###"], "vllm_xargs": {"a": 1}}),
    )
    data = json.loads(out)
    assert data == {"temperature": 0.3, "top_p": 0.5, "stop": ["###"], "vllm_xargs": {"a": 1}}


def test_build_returns_none_when_nothing_set():
    assert build_request_defaults_json({}, custom_json=None) is None
    assert build_request_defaults_json({"temperature": None}, custom_json="") is None


def test_build_ignores_invalid_custom_json():
    out = build_request_defaults_json({"temperature": 0.7}, custom_json="{not json")
    assert json.loads(out) == {"temperature": 0.7}


def test_split_separates_sampling_from_extras():
    sampling, extras = split_request_defaults(json.dumps({
        "temperature": 0.2, "top_k": 5, "stop": ["x"], "vllm_xargs": {"k": "v"},
    }))
    assert sampling == {"temperature": 0.2, "top_k": 5}
    assert extras == {"stop": ["x"], "vllm_xargs": {"k": "v"}}


def test_split_handles_missing_or_bad_json():
    assert split_request_defaults(None) == ({}, {})
    assert split_request_defaults("") == ({}, {})
    assert split_request_defaults("nope") == ({}, {})


def test_partial_update_preserves_untouched_sampling_and_extras():
    existing = json.dumps({"temperature": 0.3, "top_p": 0.5, "stop": ["###"]})
    out = build_request_defaults_json(
        {"temperature": 0.9},
        custom_json=None,
        existing_json=existing,
    )
    assert json.loads(out) == {"temperature": 0.9, "top_p": 0.5, "stop": ["###"]}


def test_explicit_custom_json_replaces_extras_but_keeps_sampling():
    existing = json.dumps({"temperature": 0.3, "stop": ["###"], "vllm_xargs": {"a": 1}})
    out = build_request_defaults_json(
        {},
        custom_json=json.dumps({"stop": ["END"]}),
        existing_json=existing,
    )
    assert json.loads(out) == {"temperature": 0.3, "stop": ["END"]}


def test_empty_custom_json_means_unchanged():
    existing = json.dumps({"temperature": 0.3, "stop": ["###"]})
    out = build_request_defaults_json({"top_k": 4}, custom_json="", existing_json=existing)
    assert json.loads(out) == {"temperature": 0.3, "top_k": 4, "stop": ["###"]}


def test_explicit_none_sampling_value_clears_it():
    existing = json.dumps({"temperature": 0.3, "top_p": 0.5})
    out = build_request_defaults_json({"top_p": None}, custom_json=None, existing_json=existing, clear_none=True)
    assert json.loads(out) == {"temperature": 0.3}


def test_gateway_merge_client_values_win():
    merged = merge_request_defaults(
        {"model": "m", "temperature": 0.1, "top_p": None},
        {"temperature": 0.9, "top_p": 0.5, "stop": ["###"]},
    )
    assert merged["temperature"] == 0.1
    assert merged["top_p"] == 0.5  # None counts as unspecified
    assert merged["stop"] == ["###"]
