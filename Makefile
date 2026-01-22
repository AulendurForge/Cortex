# Cortex Makefile
# Simplified administration for Docker-based LLM inference gateway
#
# Usage: make <target>
# Run 'make help' to see all available commands

.PHONY: help
.DEFAULT_GOAL := help

# ============================================================================
# Configuration Variables
# ============================================================================

# Environment selection (dev or prod)
ENV ?= dev
COMPOSE_FILE = docker.compose.$(ENV).yaml

# Auto-detect OS and GPU for monitoring profiles
UNAME_S := $(shell uname -s 2>/dev/null || echo "unknown")
HAS_NVIDIA := $(shell command -v nvidia-smi >/dev/null 2>&1 && echo "yes" || echo "no")

# Compose profiles for optional services
# Auto-enable Linux monitoring on Linux, and GPU monitoring if NVIDIA detected
PROFILES ?= $(shell \
	if [ "$(UNAME_S)" = "Linux" ]; then \
		if [ "$(HAS_NVIDIA)" = "yes" ]; then \
			echo "linux,gpu"; \
		else \
			echo "linux"; \
		fi; \
	fi)

COMPOSE_PROFILES = $(if $(PROFILES),COMPOSE_PROFILES=$(PROFILES),)

# Detect host IP address dynamically
HOST_IP := $(shell bash scripts/detect-ip.sh 2>/dev/null || echo "localhost")

# Docker Compose command with proper file and HOST_IP exported
DOCKER_COMPOSE = HOST_IP=$(HOST_IP) $(COMPOSE_PROFILES) docker compose -f $(COMPOSE_FILE)

# Colors for output
COLOR_RESET = \033[0m
COLOR_BOLD = \033[1m
COLOR_GREEN = \033[32m
COLOR_YELLOW = \033[33m
COLOR_BLUE = \033[34m

# ============================================================================
# Help Target - Shows all available commands
# ============================================================================

help: ## Show this help message
	@echo ""
	@echo "$(COLOR_BOLD)Cortex Administration Commands$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Basic Operations:$(COLOR_RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_GREEN)%-20s$(COLOR_RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(COLOR_BLUE)Environment Variables:$(COLOR_RESET)"
	@echo "  $(COLOR_YELLOW)ENV$(COLOR_RESET)              Environment to use (dev or prod), default: dev"
	@echo "  $(COLOR_YELLOW)PROFILES$(COLOR_RESET)         Comma-separated profiles (linux,gpu), default: auto-detected"
	@echo ""
	@echo "$(COLOR_BLUE)Auto-Detection:$(COLOR_RESET)"
	@echo "  Host IP:         $(HOST_IP)"
	@echo "  OS:              $(UNAME_S)"
	@echo "  GPU:             $(if $(filter yes,$(HAS_NVIDIA)),✓ NVIDIA detected,⨯ No NVIDIA GPU)"
	@echo "  Monitoring:      $(if $(PROFILES),Enabled ($(PROFILES)),Disabled)"
	@echo ""
	@echo "$(COLOR_BLUE)Examples:$(COLOR_RESET)"
	@echo "  make up                      # Start (auto-enables monitoring on Linux)"
	@echo "  make up ENV=prod             # Start in production mode"
	@echo "  make up PROFILES=''          # Disable auto-detected monitoring"
	@echo "  make logs SERVICE=gateway    # View logs for gateway service only"
	@echo "  make logs-dcgm               # View GPU metrics logs"
	@echo "  make monitoring-status       # Check monitoring stack health"
	@echo ""

# ============================================================================
# Core Container Operations
# ============================================================================

build: ## Build all Docker images (rebuilds if dependencies changed)
	@echo "$(COLOR_BOLD)Building Docker images...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) build --pull

up: ## Start all services (detached mode)
	@echo "$(COLOR_BOLD)Starting Cortex services...$(COLOR_RESET)"
	@if [ -n "$(PROFILES)" ]; then \
		echo "$(COLOR_BLUE)With monitoring profiles: $(PROFILES)$(COLOR_RESET)"; \
	fi
	$(DOCKER_COMPOSE) up -d
	@echo "$(COLOR_GREEN)✓ Services started$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Core Services:$(COLOR_RESET)"
	@echo "  Login to Cortex at: http://$(HOST_IP):3001/login (admin/admin)"	
	@echo ""
	@echo "  Gateway:    http://$(HOST_IP):8084"
	@echo "  Prometheus: http://$(HOST_IP):9090"
	@echo "  PgAdmin:    http://$(HOST_IP):5050"
	@if [ -n "$(findstring linux,$(PROFILES))" ]; then \
		echo ""; \
		echo "$(COLOR_BLUE)Monitoring (auto-enabled):$(COLOR_RESET)"; \
		echo "  ✓ Host metrics (node-exporter) on port 9100"; \
	fi
	@if [ -n "$(findstring gpu,$(PROFILES))" ]; then \
		echo "  ✓ GPU metrics (dcgm-exporter) on port 9400"; \
		echo "  ✓ Container metrics (cadvisor) on port 8085"; \
	fi

up-fg: ## Start all services (foreground mode, shows logs)
	@echo "$(COLOR_BOLD)Starting Cortex services in foreground...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) up

down: ## Stop and remove all containers (including model containers)
	@echo "$(COLOR_BOLD)Stopping Cortex services...$(COLOR_RESET)"
	@echo "$(COLOR_YELLOW)Note: Model containers will be stopped by gateway shutdown hook$(COLOR_RESET)"
	$(DOCKER_COMPOSE) down
	@echo "$(COLOR_GREEN)✓ Services stopped$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Checking for orphaned model containers...$(COLOR_RESET)"
	@ORPHANS=$$(docker ps -q --filter "name=vllm-model-" --filter "name=llamacpp-model-" 2>/dev/null | wc -l); \
	if [ $$ORPHANS -gt 0 ]; then \
		echo "$(COLOR_YELLOW)Found $$ORPHANS orphaned model container(s)$(COLOR_RESET)"; \
		echo "Run 'make clean-models' to remove them"; \
	else \
		echo "$(COLOR_GREEN)✓ No orphaned containers$(COLOR_RESET)"; \
	fi

restart: down up ## Restart all services

stop: ## Stop containers without removing them
	@echo "$(COLOR_BOLD)Stopping containers...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) stop

start: ## Start existing stopped containers
	@echo "$(COLOR_BOLD)Starting containers...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) start

# ============================================================================
# Monitoring and Debugging
# ============================================================================

logs: ## Show logs for all services (or specific SERVICE=name)
	@echo "$(COLOR_BOLD)Showing logs...$(COLOR_RESET)"
ifdef SERVICE
	$(DOCKER_COMPOSE) logs -f $(SERVICE)
else
	$(DOCKER_COMPOSE) logs -f
endif

logs-follow: ## Follow logs for all services (or specific SERVICE=name) - same as logs
	@echo "$(COLOR_BOLD)Following logs...$(COLOR_RESET)"
ifdef SERVICE
	$(DOCKER_COMPOSE) logs -f $(SERVICE)
else
	$(DOCKER_COMPOSE) logs -f
endif

logs-gateway: ## Show gateway logs only
	@$(DOCKER_COMPOSE) logs -f gateway

logs-postgres: ## Show PostgreSQL logs
	@$(DOCKER_COMPOSE) logs -f postgres

logs-prometheus: ## Show Prometheus logs
	@$(DOCKER_COMPOSE) logs -f prometheus

logs-node-exporter: ## Show node-exporter logs (host metrics)
	@$(DOCKER_COMPOSE) logs -f node-exporter

logs-dcgm: ## Show DCGM exporter logs (GPU metrics)
	@$(DOCKER_COMPOSE) logs -f dcgm-exporter

logs-cadvisor: ## Show cAdvisor logs (container metrics)
	@$(DOCKER_COMPOSE) logs -f cadvisor

ps: ## List running containers
	@$(DOCKER_COMPOSE) ps

status: ps ## Alias for ps

health: ## Check health of all services
	@echo "$(COLOR_BOLD)Checking service health...$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Gateway Health:$(COLOR_RESET)"
	@curl -s http://$(HOST_IP):8084/health | jq . || echo "Gateway not responding"
	@echo ""
	@echo "$(COLOR_BLUE)Docker Container Status:$(COLOR_RESET)"
	@$(DOCKER_COMPOSE) ps
	@echo ""
	@echo "$(COLOR_BLUE)Prometheus Status:$(COLOR_RESET)"
	@curl -s http://$(HOST_IP):9090/-/ready && echo "✓ Ready" || echo "⨯ Not ready"
	@echo ""
	@if [ -n "$(findstring linux,$(PROFILES))" ]; then \
		echo "$(COLOR_BLUE)Host Metrics (node-exporter):$(COLOR_RESET)"; \
		curl -s http://$(HOST_IP):9100/metrics > /dev/null && echo "✓ Collecting host metrics" || echo "⨯ Not responding"; \
		echo ""; \
	fi
	@if [ -n "$(findstring gpu,$(PROFILES))" ]; then \
		echo "$(COLOR_BLUE)GPU Metrics (dcgm-exporter):$(COLOR_RESET)"; \
		curl -s http://$(HOST_IP):9400/metrics > /dev/null && echo "✓ Collecting GPU metrics" || echo "⨯ Not responding (check NVIDIA runtime)"; \
		echo ""; \
	fi

monitoring-status: ## Check monitoring stack (exporters, Prometheus targets)
	@echo "$(COLOR_BOLD)Monitoring Stack Status$(COLOR_RESET)"
	@echo ""
	@if [ -z "$(PROFILES)" ]; then \
		echo "$(COLOR_YELLOW)⨯ Monitoring not enabled$(COLOR_RESET)"; \
		echo ""; \
		echo "$(COLOR_BLUE)To enable:$(COLOR_RESET)"; \
		echo "  On Linux: Monitoring auto-enables by default"; \
		echo "  Manual:   make up PROFILES=linux,gpu"; \
		exit 0; \
	fi
	@echo "$(COLOR_GREEN)✓ Monitoring enabled: $(PROFILES)$(COLOR_RESET)"
	@echo ""
	@if [ -n "$(findstring linux,$(PROFILES))" ]; then \
		echo "$(COLOR_BLUE)node-exporter (host metrics):$(COLOR_RESET)"; \
		if curl -sf http://localhost:9100/metrics > /dev/null; then \
			echo "  ✓ Running and collecting metrics"; \
			echo "  Port: 9100"; \
		else \
			echo "  ⨯ Not responding"; \
		fi; \
		echo ""; \
	fi
	@if [ -n "$(findstring gpu,$(PROFILES))" ]; then \
		echo "$(COLOR_BLUE)dcgm-exporter (GPU metrics):$(COLOR_RESET)"; \
		if curl -sf http://localhost:9400/metrics > /dev/null; then \
			GPU_COUNT=$$(curl -s http://localhost:9400/metrics 2>/dev/null | grep -c "DCGM_FI_DEV_GPU_UTIL{" || echo "0"); \
			echo "  ✓ Running and collecting from $$GPU_COUNT GPUs"; \
			echo "  Port: 9400"; \
		else \
			echo "  ⨯ Not responding (check: docker logs cortex-dcgm-exporter-1)"; \
			echo "  Requires: NVIDIA runtime + nvidia-docker2"; \
		fi; \
		echo ""; \
		echo "$(COLOR_BLUE)cadvisor (container metrics):$(COLOR_RESET)"; \
		if docker ps --filter "name=cortex-cadvisor-1" --format "{{.Status}}" | grep -q "Up"; then \
			echo "  ✓ Running"; \
			echo "  Port: 8085"; \
		else \
			echo "  ⨯ Not running"; \
		fi; \
		echo ""; \
	fi
	@echo "$(COLOR_BLUE)Prometheus:$(COLOR_RESET)"
	@if curl -sf http://localhost:9090/-/ready > /dev/null; then \
		echo "  ✓ Ready and scraping targets"; \
		echo "  Dashboard: http://$(HOST_IP):9090"; \
		echo ""; \
		echo "$(COLOR_BLUE)Prometheus Targets:$(COLOR_RESET)"; \
		echo "  View at: http://$(HOST_IP):9090/targets"; \
	else \
		echo "  ⨯ Not ready"; \
	fi

# ============================================================================
# Bootstrap and Setup Operations
# ============================================================================

bootstrap: ## Bootstrap admin user (interactive)
	@echo "$(COLOR_BOLD)Bootstrap Admin User$(COLOR_RESET)"
	@echo ""
	@read -p "Enter admin username (default: admin): " username; \
	username=$${username:-admin}; \
	read -sp "Enter admin password: " password; \
	echo ""; \
	read -p "Enter organization name (default: Default): " org; \
	org=$${org:-Default}; \
	echo ""; \
	echo "Creating admin user..."; \
	curl -X POST http://$(HOST_IP):8084/admin/bootstrap-owner \
	  -H 'Content-Type: application/json' \
	  -d "{\"username\":\"$$username\",\"password\":\"$$password\",\"org_name\":\"$$org\"}" \
	  | jq .

bootstrap-default: ## Bootstrap with default credentials (admin/admin)
	@echo "$(COLOR_BOLD)Bootstrapping default admin (admin/admin)...$(COLOR_RESET)"
	@curl -X POST http://$(HOST_IP):8084/admin/bootstrap-owner \
	  -H 'Content-Type: application/json' \
	  -d '{"username":"admin","password":"admin","org_name":"Default"}' \
	  | jq .
	@echo ""
	@echo "$(COLOR_GREEN)✓ Default admin created$(COLOR_RESET)"
	@echo "Login at: http://$(HOST_IP):3001/login"
	@echo "Username: admin"
	@echo "Password: admin"

create-key: ## Create a new API key (requires login cookie in cookies.txt)
	@echo "$(COLOR_BOLD)Creating API key...$(COLOR_RESET)"
	@curl -X POST http://$(HOST_IP):8084/admin/keys \
	  -b cookies.txt \
	  -H 'Content-Type: application/json' \
	  -d '{"scopes":"chat,completions,embeddings"}' \
	  | jq .
	@echo ""
	@echo "$(COLOR_YELLOW)⚠ Save the token value - it's shown only once$(COLOR_RESET)"

login: ## Login and save session cookie
	@echo "$(COLOR_BOLD)Login to Cortex$(COLOR_RESET)"
	@read -p "Username (default: admin): " username; \
	username=$${username:-admin}; \
	read -sp "Password: " password; \
	echo ""; \
	curl -X POST http://$(HOST_IP):8084/auth/login \
	  -H 'Content-Type: application/json' \
	  -d "{\"username\":\"$$username\",\"password\":\"$$password\"}" \
	  -c cookies.txt -i
	@echo ""
	@echo "$(COLOR_GREEN)✓ Session saved to cookies.txt$(COLOR_RESET)"

# ============================================================================
# Database Operations
# ============================================================================

db-backup: ## Backup PostgreSQL database
	@echo "$(COLOR_BOLD)Backing up database...$(COLOR_RESET)"
	@mkdir -p backups
	@BACKUP_FILE="backups/cortex_backup_$$(date +%Y%m%d_%H%M%S).sql"; \
	docker exec -t $$($(DOCKER_COMPOSE) ps -q postgres) \
	  pg_dump -U cortex -d cortex > $$BACKUP_FILE; \
	echo "$(COLOR_GREEN)✓ Backup saved to $$BACKUP_FILE$(COLOR_RESET)"

db-restore: ## Restore database from backup (requires BACKUP_FILE=path)
ifndef BACKUP_FILE
	@echo "$(COLOR_YELLOW)Usage: make db-restore BACKUP_FILE=backups/cortex_backup_YYYYMMDD_HHMMSS.sql$(COLOR_RESET)"
	@echo "Available backups:"
	@ls -1 backups/*.sql 2>/dev/null || echo "No backups found"
else
	@echo "$(COLOR_BOLD)Restoring database from $(BACKUP_FILE)...$(COLOR_RESET)"
	@docker exec -i $$($(DOCKER_COMPOSE) ps -q postgres) \
	  psql -U cortex -d cortex < $(BACKUP_FILE)
	@echo "$(COLOR_GREEN)✓ Database restored$(COLOR_RESET)"
endif

db-shell: ## Open PostgreSQL shell
	@docker exec -it $$($(DOCKER_COMPOSE) ps -q postgres) psql -U cortex -d cortex

db-reset: ## Reset database (DANGEROUS - deletes all data)
	@read -p "$(COLOR_YELLOW)This will delete ALL data. Are you sure? (yes/no): $(COLOR_RESET)" confirm; \
	if [ "$$confirm" = "yes" ]; then \
		echo "$(COLOR_BOLD)Resetting database...$(COLOR_RESET)"; \
		$(DOCKER_COMPOSE) down -v; \
		$(DOCKER_COMPOSE) up -d; \
		echo "$(COLOR_GREEN)✓ Database reset complete$(COLOR_RESET)"; \
		echo "Run 'make bootstrap-default' to create admin user"; \
	else \
		echo "Cancelled"; \
	fi

# ============================================================================
# Cleanup Operations
# ============================================================================

clean: down ## Stop services and remove volumes (keeps backups)
	@echo "$(COLOR_BOLD)Cleaning up Docker resources...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) down -v
	@echo "$(COLOR_GREEN)✓ Cleanup complete$(COLOR_RESET)"

clean-models: ## Stop and remove all model containers
	@echo "$(COLOR_BOLD)Removing managed model containers...$(COLOR_RESET)"
	@bash scripts/cleanup-orphaned-containers.sh || (docker ps -a --filter "name=vllm-model-" -q | xargs -r docker rm -f && docker ps -a --filter "name=llamacpp-model-" -q | xargs -r docker rm -f)
	@echo "$(COLOR_GREEN)✓ Model containers removed$(COLOR_RESET)"

clean-all: clean clean-models ## Remove everything including model containers

prune: ## Prune unused Cortex Docker resources (containers, images, volumes, networks)
	@echo "$(COLOR_YELLOW)This will remove unused Cortex Docker resources$(COLOR_RESET)"
	@echo "$(COLOR_BLUE)Pruning Cortex containers, images, volumes, and networks...$(COLOR_RESET)"
	@# Remove stopped Cortex containers (by compose project label - safe, scoped to Cortex)
	@docker ps -a --filter "label=com.docker.compose.project=cortex" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
	@# Remove model containers (by name pattern - safe, only Cortex model containers)
	@docker ps -a --filter "name=vllm-model-" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
	@docker ps -a --filter "name=llamacpp-model-" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
	@# Remove Cortex volumes (prefixed with cortex_ - safe, scoped to Cortex project)
	@docker volume ls --filter "name=cortex_" --format "{{.Name}}" | xargs -r docker volume rm 2>/dev/null || true
	@# Remove Cortex networks (prefixed with cortex_ - safe, scoped to Cortex project)
	@docker network ls --filter "name=cortex_" --format "{{.ID}}" | xargs -r docker network rm 2>/dev/null || true
	@# Use compose down to clean up compose-managed resources (scoped to this compose file only)
	@# --rmi local removes only images built locally by this compose file, not pulled images
	@$(DOCKER_COMPOSE) down --rmi local --volumes --remove-orphans 2>/dev/null || true
	@echo "$(COLOR_GREEN)✓ Cortex Docker resources pruned$(COLOR_RESET)"
	@echo "$(COLOR_BLUE)Note: Only Cortex-related resources were removed. Other Docker containers, images, volumes, and networks are unaffected.$(COLOR_RESET)"

# ============================================================================
# Testing and Validation
# ============================================================================

test: ## Run smoke tests
	@echo "$(COLOR_BOLD)Running smoke tests...$(COLOR_RESET)"
	@bash scripts/smoke.sh

test-api: ## Test API endpoints
	@echo "$(COLOR_BOLD)Testing API endpoints...$(COLOR_RESET)"
	@echo "Health check:"
	@curl -s http://$(HOST_IP):8084/health | jq .
	@echo ""
	@echo "System summary:"
	@curl -s http://$(HOST_IP):8084/admin/system/summary | jq .

validate: ## Validate complete configuration (IP, CORS, services, network)
	@bash scripts/validate-config.sh

# ============================================================================
# Development Helpers
# ============================================================================

shell-gateway: ## Open shell in gateway container
	@docker exec -it $$($(DOCKER_COMPOSE) ps -q gateway) /bin/bash

shell-postgres: ## Open shell in PostgreSQL container
	@docker exec -it $$($(DOCKER_COMPOSE) ps -q postgres) /bin/bash

tail: logs ## Alias for logs (follow mode)

watch: ## Watch container status (refresh every 2s)
	@watch -n 2 'docker compose -f $(COMPOSE_FILE) ps'

# ============================================================================
# Quick Start Helpers
# ============================================================================

setup-firewall: ## Enable Docker containers to access host services (requires sudo)
	@echo "$(COLOR_BOLD)Configuring firewall for Docker-to-host access...$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_YELLOW)This requires sudo access.$(COLOR_RESET)"
	@echo "Run: sudo bash scripts/setup-docker-firewall.sh"
	@echo ""
	@echo "$(COLOR_BLUE)Why is this needed?$(COLOR_RESET)"
	@echo "  Cortex gateway uses host network mode for universal access."
	@echo "  UFW firewall blocks Docker container traffic by default."
	@echo "  This one-time setup allows containers to reach Cortex."
	@echo ""
	@sudo bash scripts/setup-docker-firewall.sh

test-external-access: ## Test Cortex accessibility from Docker containers
	@bash scripts/test-external-access.sh

quick-start: build up ## Quick start: build and up with automatic admin bootstrap
	@echo ""
	@echo "$(COLOR_GREEN)$(COLOR_BOLD)✓ Cortex is ready!$(COLOR_RESET)"
	@echo ""
	@if [ -n "$(PROFILES)" ]; then \
		echo ""; \
		echo "$(COLOR_GREEN)✓ Monitoring enabled:$(COLOR_RESET) $(PROFILES)"; \
		echo "  View metrics in System Monitor page"; \
	fi
	@echo ""
	@echo "$(COLOR_GREEN)$(COLOR_BOLD)Next steps:$(COLOR_RESET)"
	@echo "  1. Login to Cortex at: http://$(HOST_IP):3001/login"
	@echo "     Username: admin"
	@echo "     Password: admin"
	@echo ""
	@echo "$(COLOR_GREEN)$(COLOR_BOLD)For admins:$(COLOR_RESET)"
	@echo "  2. Test creating an API key on the API Keys page"
	@echo "  3. Check System Monitor page for host machine's GPU & Hardwaremetrics"
	@echo "  4. View additional docs: https://aulendurforge.github.io/Cortex/"
	@echo ""

install-deps: ## Install required dependencies (Docker, Docker Compose)
	@echo "$(COLOR_BOLD)Checking dependencies...$(COLOR_RESET)"
	@command -v docker >/dev/null 2>&1 || { echo "$(COLOR_YELLOW)Docker not found. Install from: https://docs.docker.com/get-docker/$(COLOR_RESET)"; exit 1; }
	@command -v docker compose >/dev/null 2>&1 || { echo "$(COLOR_YELLOW)Docker Compose not found. Install from: https://docs.docker.com/compose/install/$(COLOR_RESET)"; exit 1; }
	@echo "$(COLOR_GREEN)✓ All dependencies installed$(COLOR_RESET)"

# ============================================================================
# Production-Specific Operations
# ============================================================================

prod-check: ## Pre-flight check for production deployment
	@echo "$(COLOR_BOLD)Production Readiness Check$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Checking environment variables...$(COLOR_RESET)"
	@grep -q "GATEWAY_DEV_ALLOW_ALL_KEYS.*false" $(COMPOSE_FILE) && echo "✓ Dev auth disabled" || echo "$(COLOR_YELLOW)⚠ Dev auth still enabled$(COLOR_RESET)"
	@grep -q "INTERNAL_VLLM_API_KEY" $(COMPOSE_FILE) && echo "✓ Internal API key configured" || echo "$(COLOR_YELLOW)⚠ Internal API key not set$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Security recommendations:$(COLOR_RESET)"
	@echo "  - Set GATEWAY_DEV_ALLOW_ALL_KEYS=false"
	@echo "  - Configure strong INTERNAL_VLLM_API_KEY"
	@echo "  - Set strict CORS_ALLOW_ORIGINS"
	@echo "  - Enable TLS with reverse proxy"
	@echo "  - Set up regular database backups"

# ============================================================================
# Info Commands
# ============================================================================

info: ## Show current configuration
	@echo "$(COLOR_BOLD)Current Configuration$(COLOR_RESET)"
	@echo ""
	@echo "Environment:     $(ENV)"
	@echo "Compose file:    $(COMPOSE_FILE)"
	@echo "$(COLOR_YELLOW)Detected Host IP: $(HOST_IP)$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)System Detection:$(COLOR_RESET)"
	@echo "Operating System: $(UNAME_S)"
	@echo "NVIDIA GPU:       $(HAS_NVIDIA)"
	@echo "$(COLOR_GREEN)Auto Profiles:    $(if $(PROFILES),$(PROFILES),none)$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Endpoints (use these URLs, NOT localhost):$(COLOR_RESET)"
	@echo "Gateway:         http://$(HOST_IP):8084"
	@echo "Admin UI:        http://$(HOST_IP):3001"
	@echo "Prometheus:      http://$(HOST_IP):9090"
	@echo "PgAdmin:         http://$(HOST_IP):5050"
	@echo ""
	@echo "$(COLOR_BLUE)Monitoring:$(COLOR_RESET)"
	@echo "$(if $(findstring linux,$(PROFILES)),✓ Host metrics enabled (node-exporter),⨯ Host metrics disabled (not Linux))"
	@echo "$(if $(findstring gpu,$(PROFILES)),✓ GPU metrics enabled (dcgm-exporter),⨯ GPU metrics disabled (no NVIDIA GPU detected))"
	@echo ""

urls: info ## Alias for info (show URLs)

ip: ## Show detected host IP address
	@echo "$(COLOR_YELLOW)$(COLOR_BOLD)Host IP Address: $(HOST_IP)$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Access Cortex at:$(COLOR_RESET)"
	@echo "  Admin UI: http://$(HOST_IP):3001"
	@echo "  Gateway:  http://$(HOST_IP):8084"
	@echo ""
	@echo "$(COLOR_YELLOW)⚠ Use this IP, NOT 'localhost'$(COLOR_RESET)"
	@echo "$(COLOR_BLUE)ℹ Other devices on your network should use this IP too$(COLOR_RESET)"

version: ## Show version information
	@echo "Cortex Gateway"
	@echo "Version: 0.1.1"
	@echo ""
	@docker --version
	@docker compose version

# ============================================================================
# Offline/Air-Gapped Deployment
# ============================================================================

prepare-offline: ## Download and package all Docker images for offline deployment
	@echo "$(COLOR_BOLD)Preparing offline deployment package...$(COLOR_RESET)"
	@bash scripts/prepare-offline-deployment.sh
	@echo ""
	@echo "$(COLOR_GREEN)✓ Offline package ready$(COLOR_RESET)"
	@echo ""
	@echo "Transfer cortex-offline-images/ to your offline machine"

load-offline: ## Load Docker images from offline package
	@echo "$(COLOR_BOLD)Loading offline Docker images...$(COLOR_RESET)"
	@bash scripts/load-offline-deployment.sh

verify-offline: ## Verify all required images are cached for offline operation
	@echo "$(COLOR_BOLD)Verifying offline readiness...$(COLOR_RESET)"
	@bash scripts/verify-offline-images.sh

export-images: prepare-offline ## Alias for prepare-offline

import-images: load-offline ## Alias for load-offline

offline-status: verify-offline ## Alias for verify-offline

# ============================================================================
# External Application Integration
# ============================================================================

connect-network: ## Connect Cortex to an external Docker network (NETWORK=name)
ifndef NETWORK
	@echo "$(COLOR_BOLD)Usage:$(COLOR_RESET) make connect-network NETWORK=<network-name>"
	@echo ""
	@echo "$(COLOR_BLUE)Available Docker networks:$(COLOR_RESET)"
	@docker network ls --format "  {{.Name}}" | grep -v "^  none$$\|^  host$$\|^  bridge$$"
	@echo ""
	@echo "$(COLOR_BOLD)Example:$(COLOR_RESET)"
	@echo "  make connect-network NETWORK=afwi-multi-agent-generative-engine_app-network"
else
	@bash scripts/connect-external-network.sh $(NETWORK)
endif

test-external: ## Run external access diagnostic tests
	@bash scripts/test-external-access.sh

integration-guide: ## Show integration guide for external applications
	@echo "$(COLOR_BOLD)External Application Integration Guide$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)For applications running in Docker containers (like MAGE):$(COLOR_RESET)"
	@echo ""
	@echo "  1. Connect Cortex to your application's network:"
	@echo "     $(COLOR_GREEN)make connect-network NETWORK=your-app-network$(COLOR_RESET)"
	@echo ""
	@echo "  2. Configure your application to use:"
	@echo "     $(COLOR_GREEN)Cortex URL: http://cortex-gateway-1:8084/v1$(COLOR_RESET)"
	@echo ""
	@echo "  3. Create an API key at: http://$(HOST_IP):3001/keys"
	@echo ""
	@echo "$(COLOR_BLUE)API Endpoints:$(COLOR_RESET)"
	@echo "  GET  /v1/models            - List available models"
	@echo "  POST /v1/chat/completions  - Chat completions (streaming supported)"
	@echo "  POST /v1/embeddings        - Generate embeddings"
	@echo ""
	@echo "$(COLOR_BLUE)Documentation:$(COLOR_RESET)"
	@echo "  See: docs/integration/external-applications.md"

