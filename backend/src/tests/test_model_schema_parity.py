"""Guard against field drift between the ORM, the API schemas and the frontend.

Every model configuration column must be:
  - returned by GET /admin/models (ModelItem),
  - accepted by PATCH /admin/models/{id} (UpdateModelRequest),
  - accepted by POST /admin/models (CreateModelRequest),
  - declared in the frontend zod schema (otherwise zod strips it and the
    Configure modal silently falls back to defaults - the original bug).
"""
from __future__ import annotations

import os
import re

import pytest

from src.models import Model
from src.engines.spec import ALL_FIELDS
from src.schemas.models import CreateModelRequest, ModelItem, UpdateModelRequest

# Columns that are runtime state, not configuration.
RUNTIME_COLUMNS = {"id", "state", "state_reason", "archived", "port", "container_name", "created_at", "updated_at"}
# Never returned to clients.
SECRET_COLUMNS = {"hf_token"}
# Fixed at creation time; not editable through PATCH.
IMMUTABLE_COLUMNS = {"repo_id", "local_path", "task", "engine_type"}
# Fields that exist on the API but are not columns.
SAMPLING = {"temperature", "top_p", "top_k", "repetition_penalty", "frequency_penalty", "presence_penalty"}
ITEM_ONLY_FIELDS = {"custom_request_json"} | SAMPLING
CREATE_ONLY_FIELDS = {"mode", "hf_offline", "custom_request_json"} | SAMPLING
UPDATE_ONLY_FIELDS = {"custom_request_json"} | SAMPLING


def _columns() -> set[str]:
    return {c.name for c in Model.__table__.columns}


def _fields(schema) -> set[str]:
    return set(schema.model_fields.keys())


def test_model_item_exposes_every_config_column():
    expected = _columns() - SECRET_COLUMNS
    missing = expected - _fields(ModelItem)
    assert not missing, f"ModelItem is missing columns: {sorted(missing)}"


def test_model_item_has_no_unknown_fields():
    extra = _fields(ModelItem) - _columns() - ITEM_ONLY_FIELDS
    assert not extra, f"ModelItem has fields that are not columns: {sorted(extra)}"


def test_update_request_accepts_every_editable_column():
    expected = _columns() - RUNTIME_COLUMNS - IMMUTABLE_COLUMNS | {"archived"}
    missing = expected - _fields(UpdateModelRequest)
    assert not missing, f"UpdateModelRequest is missing columns: {sorted(missing)}"
    extra = _fields(UpdateModelRequest) - _columns() - UPDATE_ONLY_FIELDS
    assert not extra, f"UpdateModelRequest has non-column fields: {sorted(extra)}"


def test_create_request_accepts_every_config_column():
    expected = _columns() - RUNTIME_COLUMNS
    missing = expected - _fields(CreateModelRequest)
    assert not missing, f"CreateModelRequest is missing columns: {sorted(missing)}"
    extra = _fields(CreateModelRequest) - _columns() - CREATE_ONLY_FIELDS
    assert not extra, f"CreateModelRequest has non-column fields: {sorted(extra)}"


def _find_validators_ts() -> str | None:
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.environ.get("CORTEX_FRONTEND_VALIDATORS", ""),
        os.path.join(here, "..", "..", "..", "frontend", "src", "lib", "validators.ts"),
        "/app/frontend/src/lib/validators.ts",
        "/app/validators.ts",
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None


def _zod_model_item_keys(path: str) -> set[str]:
    src = open(path, encoding="utf-8").read()
    m = re.search(r"export const ModelItemSchema = z\.object\(\{(.*?)\n\}\);", src, re.S)
    assert m, "ModelItemSchema block not found in validators.ts"
    return set(re.findall(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", m.group(1), re.M))


def test_frontend_zod_schema_declares_every_model_item_field():
    path = _find_validators_ts()
    if not path:
        pytest.skip("frontend validators.ts not available in this environment")
    keys = _zod_model_item_keys(path)
    missing = _fields(ModelItem) - keys
    assert not missing, (
        "frontend ModelItemSchema strips these fields (zod drops undeclared keys, "
        f"so the Configure modal falls back to defaults): {sorted(missing)}"
    )


def test_orm_config_columns_match_engine_spec():
    """Every spec field is a column and every config column is a spec field."""
    identity = {"name", "served_model_name", "repo_id", "local_path", "task", "engine_type"}
    config_cols = _columns() - RUNTIME_COLUMNS - SECRET_COLUMNS - identity
    spec_names = {f.name for f in ALL_FIELDS}
    assert config_cols == spec_names, f"missing in spec: {sorted(config_cols - spec_names)}; missing columns: {sorted(spec_names - config_cols)}"
