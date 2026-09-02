"""Tee for OpenAI-style SSE streams: forwards bytes unchanged while extracting the final
``usage`` object, so streamed requests can be metered with real token counts.

Engines emit ``data: {...}`` lines; with ``stream_options.include_usage`` the last content
chunk carries ``usage`` (vLLM emits it with an empty ``choices`` list, llama.cpp attaches it to
the final chunk). When the client did not ask for usage, the usage-only chunk is dropped so the
client sees exactly what it requested.
"""
from __future__ import annotations

import json
from typing import Any


class SseUsageTee:
    def __init__(self, *, forward_usage_chunk: bool = True) -> None:
        self.forward_usage_chunk = forward_usage_chunk
        self.usage: dict[str, Any] | None = None
        self.timings: dict[str, Any] | None = None
        self.first_token_at: float | None = None
        self._buf = b""
        self._drop_blank = False   # swallow the blank line that terminates a dropped event

    def feed(self, chunk: bytes) -> bytes:
        """Return the bytes to forward for ``chunk`` (whole events only; partial lines are buffered)."""
        self._buf += chunk
        out: list[bytes] = []
        while True:
            idx = self._buf.find(b"\n")
            if idx < 0:
                break
            line = self._buf[: idx + 1]
            self._buf = self._buf[idx + 1:]
            if self._handle_line(line):
                out.append(line)
        return b"".join(out)

    def flush(self) -> bytes:
        rest, self._buf = self._buf, b""
        if rest and not self._handle_line(rest):
            return b""
        return rest

    def _handle_line(self, line: bytes) -> bool:
        """Inspect one SSE line; return False to drop it."""
        stripped = line.strip()
        if self._drop_blank:
            self._drop_blank = False
            if not stripped:
                return False
        if not stripped.startswith(b"data:"):
            return True
        body = stripped[5:].strip()
        if body == b"[DONE]" or not body.startswith(b"{"):
            return True
        try:
            obj = json.loads(body)
        except Exception:
            return True
        usage = obj.get("usage") if isinstance(obj, dict) else None
        if isinstance(usage, dict):
            self.usage = usage
            timings = obj.get("timings")
            if isinstance(timings, dict):
                self.timings = timings
            # a usage-only chunk (no choices) is the one we injected on the client's behalf
            if not self.forward_usage_chunk and not obj.get("choices"):
                self._drop_blank = True
                return False
        return True

    def tokens(self) -> tuple[int | None, int | None, int | None]:
        u = self.usage or {}
        pt = u.get("prompt_tokens")
        ct = u.get("completion_tokens")
        tt = u.get("total_tokens")
        if tt is None and (pt is not None or ct is not None):
            tt = int(pt or 0) + int(ct or 0)
        return (int(pt) if pt is not None else None, int(ct) if ct is not None else None, int(tt) if tt is not None else None)
