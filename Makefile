# Cortex Makefile
# Administration for the Docker-based LLM inference gateway.
#
# Usage: make <target>      Run 'make help' to see all commands.

.PHONY: help
.DEFAULT_GOAL := help

# ============================================================================
# Configuration
# ============================================================================

# Environment selection (dev or prod)
ENV ?= dev
COMPOSE_FILE = docker.compose.$(ENV).yaml

# Pinned image tags: versions.env is the single source of truth. Every variable in it is
# exported so docker compose resolves ${VLLM_IMAGE:-...} etc. to the pinned values.
include versions.env
export VLLM_IMAGE LLAMACPP_IMAGE CORTEX_VERSION PYTHON_IMAGE NODE_IMAGE
export POSTGRES_IMAGE REDIS_IMAGE PGADMIN_IMAGE
export PROMETHEUS_IMAGE NODE_EXPORTER_IMAGE DCGM_EXPORTER_IMAGE CADVISOR_IMAGE

# Ports that compose reads from .env; mirrored here so `make health` probes the right ones.
env_value = $(shell grep -E '^$(1)=' .env 2>/dev/null | tail -1 | cut -d= -f2-)
PROM_PORT ?= $(or $(call env_value,PROM_PORT),19090)
FRONTEND_PORT ?= $(or $(call env_value,FRONTEND_PORT),3001)
NODE_EXPORTER_PORT ?= $(or $(call env_value,NODE_EXPORTER_PORT),9100)
CADVISOR_PORT ?= $(or $(call env_value,CADVISOR_PORT),8085)
DCGM_PORT ?= $(or $(call env_value,DCGM_PORT),9400)
GATEWAY_PORT ?= 8084

# Auto-detect OS and GPU for monitoring profiles
UNAME_S := $(shell uname -s 2>/dev/null || echo "unknown")
HAS_NVIDIA := $(shell command -v nvidia-smi >/dev/null 2>&1 && echo "yes" || echo "no")

# Compose profiles:  linux = node-exporter + cadvisor,  gpu = dcgm-exporter,  tools = pgadmin (dev only)
PROFILES ?= $(shell \
	if [ "$(UNAME_S)" = "Linux" ]; then \
		if [ "$(HAS_NVIDIA)" = "yes" ]; then echo "linux,gpu"; else echo "linux"; fi; \
	fi)
COMPOSE_PROFILES = $(if $(PROFILES),COMPOSE_PROFILES=$(PROFILES),)

# Host LAN IP (scripts/detect-ip.sh is the one implementation; the entrypoint only falls back)
HOST_IP := $(shell bash scripts/detect-ip.sh 2>/dev/null || echo "localhost")

DOCKER_COMPOSE = HOST_IP=$(HOST_IP) PROM_PORT=$(PROM_PORT) FRONTEND_PORT=$(FRONTEND_PORT) $(COMPOSE_PROFILES) docker compose -f $(COMPOSE_FILE)
GATEWAY_CONTAINER = cortex-gateway-1
# integration tests log in with the admin from .env
# Values are read by the recipe shell (double-quoted) so passwords with shell-special characters survive.
env_shell = "$$(sed -nE 's/^$(1)=(.*)$$/\1/p' .env 2>/dev/null | tail -1 | sed -E "s/^'(.*)'$$/\\1/; s/^\"(.*)\"$$/\\1/")"
TEST_ADMIN_ENV = -e CORTEX_TEST_ADMIN_USER=$(call env_shell,ADMIN_BOOTSTRAP_USERNAME) -e CORTEX_TEST_ADMIN_PASS=$(call env_shell,ADMIN_BOOTSTRAP_PASSWORD)
FRONTEND_CONTAINER = cortex-frontend-1

# Colors
COLOR_RESET = \033[0m
COLOR_BOLD = \033[1m
COLOR_GREEN = \033[32m
COLOR_YELLOW = \033[33m
COLOR_BLUE = \033[34m

# ============================================================================
# Help
# ============================================================================

help: ## Show this help message
	@echo ""
	@echo "$(COLOR_BOLD)Cortex Administration Commands$(COLOR_RESET)"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_GREEN)%-22s$(COLOR_RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(COLOR_BLUE)Variables:$(COLOR_RESET)"
	@echo "  $(COLOR_YELLOW)ENV$(COLOR_RESET)        dev (default) or prod        $(COLOR_YELLOW)PROFILES$(COLOR_RESET)  linux,gpu,tools (auto: $(if $(PROFILES),$(PROFILES),none))"
	@echo "  $(COLOR_YELLOW)PROM_PORT$(COLOR_RESET)  $(PROM_PORT) (default 19090; avoids Cockpit on 9090)"
	@echo ""
	@echo "$(COLOR_BLUE)Detected:$(COLOR_RESET) host IP $(HOST_IP), $(UNAME_S), GPU: $(if $(filter yes,$(HAS_NVIDIA)),yes,no)"
	@echo ""
	@echo "$(COLOR_BLUE)Examples:$(COLOR_RESET)"
	@echo "  make quick-start             # build + up + admin account (prompts once)"
	@echo "  make up PROFILES=linux,gpu,tools"
	@echo "  make logs SERVICE=gateway"
	@echo "  make test-backend            # unit tests inside the gateway container"
	@echo "  make prod-check && make up ENV=prod"
	@echo ""

# ============================================================================
# Core container operations
# ============================================================================

# `make build PULL=1` refreshes base images; the default never pulls so offline hosts work.
BUILD_ARGS = $(if $(PULL),--pull,)

build: ## Build the gateway and frontend images (PULL=1 to refresh base images)
	@echo "$(COLOR_BOLD)Building Cortex images (version $(CORTEX_VERSION))...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) build $(BUILD_ARGS) gateway frontend

# Fail fast when a published port is held by something that is not one of our containers
# (Cockpit uses 9090, a host node_exporter 9100, ...); compose would otherwise abort half-way through `up`.
check-ports:
	@bash scripts/check-ports.sh $(DOCKER_COMPOSE)

up: ensure-env check-ports ## Start all services (detached; asks for admin credentials only while .env lacks them)
	@echo "$(COLOR_BOLD)Starting Cortex ($(ENV))...$(COLOR_RESET)"
	@if [ -n "$(PROFILES)" ]; then echo "$(COLOR_BLUE)Profiles: $(PROFILES)$(COLOR_RESET)"; fi
	$(DOCKER_COMPOSE) up -d
	@echo "$(COLOR_GREEN)✓ Services started$(COLOR_RESET)"
	@echo ""
	@echo "  Admin UI:   http://$(HOST_IP):$(FRONTEND_PORT)/login"
	@echo "  Gateway:    http://$(HOST_IP):$(GATEWAY_PORT)"
	@echo "  Prometheus: http://$(HOST_IP):$(PROM_PORT)"
	@if [ -n "$(findstring tools,$(PROFILES))" ]; then echo "  PgAdmin:    http://127.0.0.1:5050 (loopback only)"; fi
	@if [ -n "$(findstring linux,$(PROFILES))" ]; then echo "  node-exporter 127.0.0.1:$(NODE_EXPORTER_PORT), cadvisor 127.0.0.1:$(CADVISOR_PORT)"; fi
	@if [ -n "$(findstring gpu,$(PROFILES))" ]; then echo "  dcgm-exporter 127.0.0.1:$(DCGM_PORT)"; fi

up-fg: ## Start all services in the foreground (shows logs)
	$(DOCKER_COMPOSE) up

down: ## Stop and remove the compose services (model containers keep running)
	@echo "$(COLOR_BOLD)Stopping Cortex services...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) down
	@echo "$(COLOR_GREEN)✓ Services stopped$(COLOR_RESET)"
	@RUNNING=$$(docker ps -q --filter "label=cortex.managed=1" 2>/dev/null | wc -l); \
	if [ $$RUNNING -gt 0 ]; then \
		echo "$(COLOR_YELLOW)$$RUNNING model container(s) still running (the gateway re-adopts them on restart).$(COLOR_RESET)"; \
		echo "Run 'make clean-models' to remove them."; \
	fi

restart: down up ## Restart all services

stop: ## Stop containers without removing them
	$(DOCKER_COMPOSE) stop

start: ## Start existing stopped containers
	$(DOCKER_COMPOSE) start

# ============================================================================
# Monitoring and debugging
# ============================================================================

logs: ## Follow logs for all services (or SERVICE=name)
ifdef SERVICE
	$(DOCKER_COMPOSE) logs -f $(SERVICE)
else
	$(DOCKER_COMPOSE) logs -f
endif

logs-gateway: ## Gateway logs
	@$(DOCKER_COMPOSE) logs -f gateway

logs-postgres: ## PostgreSQL logs
	@$(DOCKER_COMPOSE) logs -f postgres

logs-prometheus: ## Prometheus logs
	@$(DOCKER_COMPOSE) logs -f prometheus

logs-node-exporter: ## node-exporter logs (host metrics)
	@$(DOCKER_COMPOSE) logs -f node-exporter

logs-dcgm: ## DCGM exporter logs (GPU metrics)
	@$(DOCKER_COMPOSE) logs -f dcgm-exporter

logs-cadvisor: ## cAdvisor logs (container metrics)
	@$(DOCKER_COMPOSE) logs -f cadvisor

logs-models: ## Logs of every running model container
	@for c in $$(docker ps --filter "label=cortex.managed=1" --format '{{.Names}}'); do \
		echo "$(COLOR_BOLD)== $$c$(COLOR_RESET)"; docker logs --tail 50 $$c 2>&1; done

ps: ## List compose containers and managed model containers
	@$(DOCKER_COMPOSE) ps
	@echo ""
	@echo "$(COLOR_BLUE)Model containers:$(COLOR_RESET)"
	@docker ps -a --filter "label=cortex.managed=1" --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || true

status: ps ## Alias for ps

health: ## Check health of all services
	@echo "$(COLOR_BOLD)Gateway:$(COLOR_RESET)"
	@curl -s http://127.0.0.1:$(GATEWAY_PORT)/health | jq . 2>/dev/null || echo "  ⨯ not responding on :$(GATEWAY_PORT)"
	@echo "$(COLOR_BOLD)Containers:$(COLOR_RESET)"
	@$(DOCKER_COMPOSE) ps
	@echo "$(COLOR_BOLD)Prometheus (:$(PROM_PORT)):$(COLOR_RESET)"
	@curl -sf http://127.0.0.1:$(PROM_PORT)/-/ready >/dev/null && echo "  ✓ ready" || echo "  ⨯ not ready"
	@if [ -n "$(findstring linux,$(PROFILES))" ]; then \
		curl -sf http://127.0.0.1:$(NODE_EXPORTER_PORT)/metrics >/dev/null && echo "  ✓ node-exporter (:$(NODE_EXPORTER_PORT))" || echo "  ⨯ node-exporter not responding on 127.0.0.1:$(NODE_EXPORTER_PORT)"; \
		curl -sf http://127.0.0.1:$(CADVISOR_PORT)/metrics >/dev/null && echo "  ✓ cadvisor (:$(CADVISOR_PORT))" || echo "  ⨯ cadvisor not responding on 127.0.0.1:$(CADVISOR_PORT)"; \
	fi
	@if [ -n "$(findstring gpu,$(PROFILES))" ]; then \
		curl -sf http://127.0.0.1:$(DCGM_PORT)/metrics >/dev/null && echo "  ✓ dcgm-exporter (:$(DCGM_PORT))" || echo "  ⨯ dcgm-exporter not responding on 127.0.0.1:$(DCGM_PORT) (NVIDIA runtime?)"; \
	fi

monitoring-status: ## Check the monitoring stack and Prometheus targets
	@if [ -z "$(PROFILES)" ]; then echo "$(COLOR_YELLOW)Monitoring profiles disabled (make up PROFILES=linux,gpu)$(COLOR_RESET)"; exit 0; fi
	@echo "$(COLOR_GREEN)Profiles: $(PROFILES)$(COLOR_RESET)"
	@$(MAKE) --no-print-directory health
	@echo "$(COLOR_BOLD)Prometheus targets:$(COLOR_RESET)"
	@curl -sf http://127.0.0.1:$(PROM_PORT)/api/v1/targets 2>/dev/null \
		| jq -r '.data.activeTargets[] | "  \(.labels.job)\t\(.scrapeUrl)\t\(.health)"' 2>/dev/null \
		|| echo "  (Prometheus not reachable on :$(PROM_PORT); UI: http://$(HOST_IP):$(PROM_PORT)/targets)"

# ============================================================================
# Bootstrap and setup
# ============================================================================

ensure-env: ## Create .env if missing, generate secrets, ask for admin credentials while blank
	@bash scripts/ensure-env.sh

setup-admin: ## Set or reset the admin username/password (.env + running gateway); LOGOUT_ALL=1 signs everyone out
	@bash scripts/setup-admin.sh

bootstrap: setup-admin ## Alias for setup-admin

login: ## Login and save the admin session cookie to cookies.txt
	@read -p "Username (default: $(call env_value,ADMIN_BOOTSTRAP_USERNAME)): " username; username=$${username:-$(call env_value,ADMIN_BOOTSTRAP_USERNAME)}; \
	read -sp "Password: " password; echo ""; \
	curl -sS -X POST http://127.0.0.1:$(GATEWAY_PORT)/auth/login \
	  -H 'Content-Type: application/json' \
	  -d "{\"username\":\"$$username\",\"password\":\"$$password\"}" -c cookies.txt -o /dev/null -w "HTTP %{http_code}\n"
	@echo "$(COLOR_GREEN)✓ Session saved to cookies.txt$(COLOR_RESET)"

create-key: ## Create an API key (requires cookies.txt from make login)
	@curl -sS -X POST http://127.0.0.1:$(GATEWAY_PORT)/admin/keys -b cookies.txt \
	  -H 'Content-Type: application/json' -d '{"scopes":"chat,completions,embeddings"}' | jq .
	@echo "$(COLOR_YELLOW)⚠ Save the token: it is shown only once$(COLOR_RESET)"

# ============================================================================
# Database
# ============================================================================

migrate: ## Run Alembic migrations (alembic upgrade head) inside the gateway container
	@docker exec $(GATEWAY_CONTAINER) python -c "from src.services.migrations import run_migrations; from src.config import get_settings; run_migrations(get_settings().DATABASE_URL); print('migrations: head')"

db-backup: ## Backup PostgreSQL to backups/cortex_backup_<timestamp>.sql
	@mkdir -p backups
	@BACKUP_FILE="backups/cortex_backup_$$(date +%Y%m%d_%H%M%S).sql"; \
	docker exec -t $$($(DOCKER_COMPOSE) ps -q postgres) pg_dump -U cortex -d cortex > $$BACKUP_FILE; \
	echo "$(COLOR_GREEN)✓ Backup saved to $$BACKUP_FILE$(COLOR_RESET)"

db-restore: ## Restore PostgreSQL (BACKUP_FILE=backups/cortex_backup_*.sql)
ifndef BACKUP_FILE
	@echo "Usage: make db-restore BACKUP_FILE=backups/cortex_backup_YYYYMMDD_HHMMSS.sql"
	@ls -1 backups/*.sql 2>/dev/null || echo "No backups found"
else
	@docker exec -i $$($(DOCKER_COMPOSE) ps -q postgres) psql -U cortex -d cortex < $(BACKUP_FILE)
	@echo "$(COLOR_GREEN)✓ Database restored$(COLOR_RESET)"
endif

db-shell: ## Open a psql shell
	@docker exec -it $$($(DOCKER_COMPOSE) ps -q postgres) psql -U cortex -d cortex

db-reset: ## Reset the database (DANGEROUS: deletes all Cortex data)
	@read -p "$(COLOR_YELLOW)This deletes ALL Cortex data. Type yes to continue: $(COLOR_RESET)" confirm; \
	if [ "$$confirm" = "yes" ]; then $(DOCKER_COMPOSE) down -v && $(DOCKER_COMPOSE) up -d; else echo "Cancelled"; fi

# ============================================================================
# Cleanup
# ============================================================================

clean: down ## Stop services and remove volumes (keeps backups/ and model files)
	$(DOCKER_COMPOSE) down -v

clean-models: ## Stop and remove every Cortex-managed model container
	@bash scripts/cleanup-orphaned-containers.sh || docker ps -aq --filter "label=cortex.managed=1" | xargs -r docker rm -f
	@echo "$(COLOR_GREEN)✓ Model containers removed$(COLOR_RESET)"

clean-all: clean clean-models ## Remove services, volumes and model containers

prune: ## Remove unused Cortex Docker resources (containers, cortex_* volumes/networks, local images)
	@docker ps -aq --filter "label=com.docker.compose.project=cortex" | xargs -r docker rm -f 2>/dev/null || true
	@docker ps -aq --filter "label=cortex.managed=1" | xargs -r docker rm -f 2>/dev/null || true
	@docker volume ls -q --filter "name=cortex_" | xargs -r docker volume rm 2>/dev/null || true
	@docker network ls -q --filter "name=cortex_" | xargs -r docker network rm 2>/dev/null || true
	@$(DOCKER_COMPOSE) down --rmi local --volumes --remove-orphans 2>/dev/null || true
	@echo "$(COLOR_GREEN)✓ Cortex resources pruned (other Docker resources untouched)$(COLOR_RESET)"

# ============================================================================
# Testing and validation
# ============================================================================

test: test-backend test-frontend ## Run backend unit tests and frontend tests

test-backend: ## Backend unit tests inside the running gateway container
	@docker exec $(TEST_ADMIN_ENV) $(GATEWAY_CONTAINER) python -m pytest src/tests -q -m "not live"

test-integration: ## Backend integration tests against the running gateway (admin from .env)
	@docker exec $(TEST_ADMIN_ENV) $(GATEWAY_CONTAINER) python -m pytest src/tests -q -m "integration"

test-frontend: ## Frontend vitest + typecheck inside the running frontend container
	@docker exec $(FRONTEND_CONTAINER) npx vitest run
	@docker exec $(FRONTEND_CONTAINER) npm run typecheck
	@docker exec $(FRONTEND_CONTAINER) npm run lint

test-live: ## Live llama.cpp inference test: make test-live GGUF=<path relative to models dir>
ifndef GGUF
	@echo "Usage: make test-live GGUF=qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_k_m.gguf [NGL=99]"
	@echo "Starts a real container with $(LLAMACPP_IMAGE) and chats through the gateway."
else
	@docker exec $(TEST_ADMIN_ENV) -e CORTEX_LIVE_GGUF=$(GGUF) -e CORTEX_LIVE_NGL=$(or $(NGL),99) $(GATEWAY_CONTAINER) \
		python -m pytest src/tests/test_live_llamacpp_inference.py -q -s
endif

smoke: ## Post-deploy smoke test (CORTEX_API_KEY=... MODEL=<served name>)
	@bash scripts/smoke.sh

test-api: ## Quick API probe (health + system summary; needs cookies.txt for the admin route)
	@curl -s http://127.0.0.1:$(GATEWAY_PORT)/health | jq .
	@curl -s -b cookies.txt http://127.0.0.1:$(GATEWAY_PORT)/admin/system/summary | jq . 2>/dev/null || echo "(login first: make login)"

validate: ## Validate host configuration (IP, CORS, services, firewall)
	@bash scripts/validate-config.sh

# ============================================================================
# Development helpers
# ============================================================================

shell-gateway: ## Shell in the gateway container
	@docker exec -it $(GATEWAY_CONTAINER) /bin/bash

shell-postgres: ## Shell in the PostgreSQL container
	@docker exec -it $$($(DOCKER_COMPOSE) ps -q postgres) /bin/bash

watch: ## Watch container status (2s refresh)
	@watch -n 2 'docker compose -f $(COMPOSE_FILE) ps; docker ps --filter label=cortex.managed=1 --format "table {{.Names}}\t{{.Status}}"'

config: ## Print the rendered compose configuration
	@INTERNAL_VLLM_API_KEY=$${INTERNAL_VLLM_API_KEY:-x} SESSION_SECRET=$${SESSION_SECRET:-x} ADMIN_BOOTSTRAP_PASSWORD=$${ADMIN_BOOTSTRAP_PASSWORD:-x} CORS_ALLOW_ORIGINS=$${CORS_ALLOW_ORIGINS:-x} $(DOCKER_COMPOSE) config

# ============================================================================
# Quick start and integration
# ============================================================================

setup-firewall: ## Allow Docker containers to reach the host gateway (UFW; needs sudo)
	@sudo bash scripts/setup-docker-firewall.sh

test-external-access: ## Diagnose reachability of the gateway from LAN and containers
	@bash scripts/test-external-access.sh

quick-start: ensure-env build up ## Build, start and create the admin account (asks for credentials once)
	@echo ""
	@echo "$(COLOR_GREEN)$(COLOR_BOLD)✓ Cortex is starting.$(COLOR_RESET) Login at http://$(HOST_IP):$(FRONTEND_PORT)/login as $(call env_value,ADMIN_BOOTSTRAP_USERNAME)"
	@echo "  Change credentials any time with 'make setup-admin'. Create an API key, then add a model."
	@echo "  Docs: docs/getting-started/quick-start.md"

install-deps: ## Verify Docker and Docker Compose are installed
	@command -v docker >/dev/null 2>&1 || { echo "Docker not found: https://docs.docker.com/get-docker/"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin not found: https://docs.docker.com/compose/install/"; exit 1; }
	@echo "$(COLOR_GREEN)✓ Docker $$(docker --version | awk '{print $$3}') and compose $$(docker compose version --short)$(COLOR_RESET)"

integration-guide: ## How external applications reach Cortex
	@echo "Cortex listens on the host network: use http://$(HOST_IP):$(GATEWAY_PORT)/v1 from the LAN"
	@echo "and http://host.docker.internal:$(GATEWAY_PORT)/v1 from containers (add extra_hosts: host.docker.internal:host-gateway)."
	@echo "Create a key in the UI (API Keys) and send it as 'Authorization: Bearer <key>'."
	@echo "Docs: docs/integration/external-applications.md"

# ============================================================================
# Production
# ============================================================================

prod-check: ## Validate secrets, image pins and the rendered prod compose config (exit 1 on failure)
	@bash scripts/prod-check.sh

# ============================================================================
# Info
# ============================================================================

info: ## Show detected configuration and URLs
	@echo "$(COLOR_BOLD)Cortex $(CORTEX_VERSION)$(COLOR_RESET)  env=$(ENV)  compose=$(COMPOSE_FILE)"
	@echo "Host IP: $(COLOR_YELLOW)$(HOST_IP)$(COLOR_RESET)  OS: $(UNAME_S)  GPU: $(HAS_NVIDIA)  profiles: $(if $(PROFILES),$(PROFILES),none)"
	@echo "Admin UI:   http://$(HOST_IP):$(FRONTEND_PORT)"
	@echo "Gateway:    http://$(HOST_IP):$(GATEWAY_PORT)"
	@echo "Prometheus: http://$(HOST_IP):$(PROM_PORT)"

urls: info ## Alias for info

ip: ## Show the detected host IP
	@echo "$(COLOR_YELLOW)$(COLOR_BOLD)Host IP: $(HOST_IP)$(COLOR_RESET)  (use this from other devices, not localhost)"

versions: ## Show pinned image versions from every source (versions.env, config.py, compose, offline package)
	@echo "$(COLOR_BOLD)versions.env$(COLOR_RESET)"
	@grep -E '^[A-Z_]+=' versions.env | sed 's/^/  /'
	@echo "$(COLOR_BOLD)backend/src/config.py$(COLOR_RESET)"
	@grep -E '^\s+(VLLM_IMAGE|LLAMACPP_IMAGE): str = ' backend/src/config.py | sed -E 's/^\s+/  /'
	@echo "$(COLOR_BOLD)rendered $(COMPOSE_FILE)$(COLOR_RESET)"
	@INTERNAL_VLLM_API_KEY=x SESSION_SECRET=x ADMIN_BOOTSTRAP_PASSWORD=x CORS_ALLOW_ORIGINS=x \
		$(DOCKER_COMPOSE) config 2>/dev/null | grep -E '^\s+image:' | sort -u | sed 's/^\s*/  /'
	@if [ -f cortex-offline-bundle/images.json ]; then echo "$(COLOR_BOLD)cortex-offline-bundle/images.json$(COLOR_RESET)"; \
		python3 -c "import json;[print('  '+i['ref']) for i in json.load(open('cortex-offline-bundle/images.json'))]" 2>/dev/null || true; fi

version: ## Show Cortex and Docker versions
	@echo "Cortex $(CORTEX_VERSION)"
	@docker --version
	@docker compose version

# ============================================================================
# Offline / air-gapped deployment
# ============================================================================

# Transfer bundles (same layout as the Deployment page): images/*.tar + images.json + bundle.json.
# The connected host builds the program + dependency images, saves every pinned image and
# (optionally) the Python wheelhouse; the air-gapped host imports the bundle and can then rebuild
# the gateway/frontend from modified source with `make build-offline` (no network needed).

build-deps: ## Build the dependency images (cortex-gateway-deps / cortex-frontend-deps:<version>) used for offline rebuilds
	@echo "$(COLOR_BOLD)Building dependency images (version $(CORTEX_VERSION))...$(COLOR_RESET)"
	docker build $(BUILD_ARGS) --build-arg PYTHON_IMAGE=$(PYTHON_IMAGE) --target deps -t cortex-gateway-deps:$(CORTEX_VERSION) backend
	docker build $(BUILD_ARGS) --build-arg NODE_IMAGE=$(NODE_IMAGE) --target deps -t cortex-frontend-deps:$(CORTEX_VERSION) frontend
	@echo "$(COLOR_GREEN)✓ cortex-gateway-deps:$(CORTEX_VERSION) and cortex-frontend-deps:$(CORTEX_VERSION)$(COLOR_RESET)"

build-offline: ## Rebuild gateway + frontend from source WITHOUT network, on top of the dependency images
	@docker image inspect cortex-gateway-deps:$(CORTEX_VERSION) >/dev/null 2>&1 || { echo "cortex-gateway-deps:$(CORTEX_VERSION) missing: import a program bundle first (make import-bundle BUNDLE=...)"; exit 1; }
	@docker image inspect cortex-frontend-deps:$(CORTEX_VERSION) >/dev/null 2>&1 || { echo "cortex-frontend-deps:$(CORTEX_VERSION) missing: import a program bundle first (make import-bundle BUNDLE=...)"; exit 1; }
	docker build --network none --build-arg DEPS_IMAGE=cortex-gateway-deps:$(CORTEX_VERSION) -f backend/Dockerfile.offline -t cortex-gateway:$(CORTEX_VERSION) backend
	docker build --network none --build-arg DEPS_IMAGE=cortex-frontend-deps:$(CORTEX_VERSION) --build-arg NODE_IMAGE=$(NODE_IMAGE) -f frontend/Dockerfile.offline -t cortex-frontend:$(CORTEX_VERSION) frontend
	@if [ "$(ENV)" = "dev" ]; then \
		docker tag cortex-gateway:$(CORTEX_VERSION) cortex-gateway:dev; \
		docker build --network none --build-arg DEPS_IMAGE=cortex-frontend-deps:$(CORTEX_VERSION) --build-arg NODE_IMAGE=$(NODE_IMAGE) --target dev -f frontend/Dockerfile.offline -t cortex-frontend:dev frontend; \
	fi
	@echo "$(COLOR_GREEN)✓ rebuilt offline: cortex-gateway:$(CORTEX_VERSION), cortex-frontend:$(CORTEX_VERSION)$(COLOR_RESET)  (restart: make up)"

prepare-offline: ## Build the program bundle (all pinned images + Cortex + deps images + wheels) in cortex-offline-bundle/
	@bash scripts/prepare-offline-deployment.sh

load-offline: ## Import a bundle on the air-gapped host: make load-offline [BUNDLE=cortex-offline-bundle]
	@BUNDLE=$(or $(BUNDLE),cortex-offline-bundle) bash scripts/load-offline-deployment.sh

import-bundle: load-offline ## Alias for load-offline (BUNDLE=/media/usb/<bundle>)

verify-offline: ## Verify every pinned image is present locally
	@bash scripts/verify-offline-images.sh

export-images: prepare-offline ## Alias for prepare-offline
import-images: load-offline ## Alias for load-offline
offline-status: verify-offline ## Alias for verify-offline
