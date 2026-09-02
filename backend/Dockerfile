# Cortex gateway image.
#
# Runs as the non-root `cortex` user. The entrypoint (started as root) adds the GID that owns
# /var/run/docker.sock as a supplementary group and then drops privileges with setpriv, so
# the gateway can talk to the Docker daemon on any host without knowing the docker GID at
# build time. Set CORTEX_RUN_AS_ROOT=true to skip the privilege drop (debugging only).
#
# Host directories mounted rw (/var/cortex/exports, /var/cortex/models for multipart GGUF
# handling) must be writable by CORTEX_UID (default 1000):  sudo chown -R 1000 /var/cortex/exports
#
# Stages:  deps  = base OS packages + Python requirements (no source). `make build-deps` tags it as
#                  cortex-gateway-deps:<version>; a transfer bundle ships it so the gateway can be
#                  rebuilt on an air-gapped host from source with Dockerfile.offline (no pip, no apt).
#          final = deps + source (the default target)
ARG PYTHON_IMAGE=python:3.11-slim
FROM ${PYTHON_IMAGE} AS deps

ARG CORTEX_UID=1000
ARG CORTEX_GID=1000

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# iproute2: host-IP detection in the entrypoint; curl: compose healthcheck; util-linux: setpriv
RUN apt-get update \
    && apt-get install -y --no-install-recommends iproute2 curl util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g "${CORTEX_GID}" cortex \
    && useradd -m -u "${CORTEX_UID}" -g cortex -s /bin/bash cortex

# Optional wheelhouse for air-gapped builds: `pip download -r requirements.txt -d wheels/`
# on a connected host, then `docker build --build-arg PIP_FIND_LINKS=/wheels ...`.
COPY requirements.txt .
# `wheel[s]/` is a glob so the COPY succeeds when no wheelhouse is present
COPY requirements.txt wheel[s]/ /wheels/
ARG PIP_FIND_LINKS=""
RUN if [ -n "${PIP_FIND_LINKS}" ]; then \
        pip install --no-cache-dir --no-index --find-links "${PIP_FIND_LINKS}" -r requirements.txt; \
    else \
        pip install --no-cache-dir -r requirements.txt; \
    fi \
    && rm -rf /wheels

FROM deps AS final
COPY --chown=cortex:cortex src ./src
COPY --chown=cortex:cortex alembic ./alembic
COPY --chown=cortex:cortex alembic.ini ./alembic.ini
COPY --chown=cortex:cortex pytest.ini conftest.py ./
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /var/cortex && chown cortex:cortex /var/cortex

EXPOSE 8084
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8084/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
