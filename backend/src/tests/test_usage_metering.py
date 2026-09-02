"""Pure-function tests for usage metering helpers (no database, no network)."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from src.services.sse_usage import SseUsageTee
from src.services.usage_analytics import normalize_task, zero_fill, clamp_hours, BUCKETS


def _sse(obj) -> bytes:
    return b"data: " + json.dumps(obj).encode() + b"\n\n"


def test_tee_extracts_usage_and_forwards_bytes_unchanged_when_client_wants_usage():
    tee = SseUsageTee(forward_usage_chunk=True)
    c1 = _sse({"id": "x", "choices": [{"delta": {"content": "hi"}}]})
    c2 = _sse({"id": "x", "choices": [], "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8}})
    done = b"data: [DONE]\n\n"
    out = tee.feed(c1) + tee.feed(c2) + tee.feed(done) + tee.flush()
    assert out == c1 + c2 + done
    assert tee.tokens() == (3, 5, 8)


def test_tee_strips_injected_usage_only_chunk_but_keeps_llamacpp_final_chunk():
    tee = SseUsageTee(forward_usage_chunk=False)
    only = _sse({"choices": [], "usage": {"prompt_tokens": 1, "completion_tokens": 2}})
    assert tee.feed(only) == b""
    assert tee.tokens() == (1, 2, 3)
    # llama.cpp attaches usage + timings to the last content chunk: forwarded, timings captured
    tee2 = SseUsageTee(forward_usage_chunk=False)
    final = _sse({"choices": [{"delta": {}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10},
                  "timings": {"predicted_per_second": 200.0}})
    assert tee2.feed(final) == final
    assert tee2.timings == {"predicted_per_second": 200.0}


def test_tee_handles_chunks_split_mid_line():
    tee = SseUsageTee()
    payload = _sse({"choices": [], "usage": {"prompt_tokens": 2, "completion_tokens": 2, "total_tokens": 4}})
    a, b = payload[:10], payload[10:]
    assert tee.feed(a) == b""          # incomplete line is buffered
    assert tee.feed(b) == payload      # whole event emitted once complete
    assert tee.tokens() == (2, 2, 4)
    assert tee.flush() == b""


def test_tee_ignores_comments_and_malformed_lines():
    tee = SseUsageTee()
    junk = b": keepalive\n\ndata: {not json}\n\n"
    assert tee.feed(junk) == junk
    assert tee.tokens() == (None, None, None)


def test_normalize_task_maps_endpoint_names_to_stored_values():
    assert normalize_task("chat") == "generate"
    assert normalize_task("completions") == "generate"
    assert normalize_task("embeddings") == "embed"
    assert normalize_task("embed") == "embed"
    assert normalize_task("generate") == "generate"
    assert normalize_task("") is None and normalize_task(None) is None
    assert normalize_task("weird") == "weird"


def test_zero_fill_emits_every_bucket_in_window():
    now = datetime(2026, 9, 2, 12, 30, 15, tzinfo=timezone.utc)
    end_b = int(now.timestamp()) // 3600 * 3600
    pts = {float(end_b - 3600): (5, 100)}
    series = zero_fill(pts, hours=3, bucket="hour", now=now)
    assert [p.ts for p in series] == [float(end_b - 3 * 3600 + i * 3600) for i in range(4)]
    assert [p.requests for p in series] == [0, 0, 5, 0]
    assert series[2].total_tokens == 100
    day = zero_fill({}, hours=48, bucket="day", now=now)
    assert len(day) == 3 and all(p.requests == 0 for p in day)


def test_clamp_hours_and_buckets():
    assert clamp_hours(None) == 24
    assert clamp_hours(0) == 1
    assert clamp_hours(10_000) == 24 * 30
    assert set(BUCKETS) == {"minute", "hour", "day"}
