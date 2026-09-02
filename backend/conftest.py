"""Root conftest: assign pytest markers by test module.

Modules that talk to a running gateway are `integration`; the real-container test is
`live`; everything else is `unit`. CI runs `pytest -m "not live and not integration"`.
Marking here (instead of inside each file) keeps the classification in one place.
"""
from __future__ import annotations

import pytest

INTEGRATION_MODULES = {
    "test_model_crud_api.py",
    "test_bundles_integration.py",
    "test_prometheus_sd.py",
}
LIVE_MODULES = {
    "test_live_llamacpp_inference.py",
}


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    for item in items:
        name = item.path.name
        if name in LIVE_MODULES:
            item.add_marker(pytest.mark.live)
        elif name in INTEGRATION_MODULES:
            item.add_marker(pytest.mark.integration)
        else:
            item.add_marker(pytest.mark.unit)
