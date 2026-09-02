from functools import lru_cache
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    VLLM_GEN_URLS: str = "http://localhost:8001"
    VLLM_EMB_URLS: str = "http://localhost:8002"
    INTERNAL_VLLM_API_KEY: str = ""
    # Accept /v1 requests without an API key. NEVER enable outside a trusted dev box.
    GATEWAY_DEV_ALLOW_ALL_KEYS: bool = False
    # Secret used to sign admin session cookies. Auto-generated and persisted in ConfigKV when empty.
    SESSION_SECRET: str = ""
    SESSION_TTL_HOURS: int = 8
    # Set True behind TLS so the session cookie is only sent over https.
    SESSION_COOKIE_SECURE: bool = False
    REQUEST_MAX_BODY_BYTES: int = 1_048_576
    # Rate limiting / Redis
    RATE_LIMIT_ENABLED: bool = False
    RATE_LIMIT_RPS: int = 10
    RATE_LIMIT_BURST: int = 20
    RATE_LIMIT_WINDOW_SEC: int = 0  # 0 disables sliding window check
    RATE_LIMIT_MAX_REQUESTS: int = 0  # max requests within window when enabled
    REDIS_URL: str = "redis://redis:6379/0"
    # Concurrency caps (for streaming)
    CONCURRENCY_LIMIT_ENABLED: bool = False
    MAX_CONCURRENT_STREAMS_PER_ID: int = 5
    # Circuit breaker (simple)
    CB_ENABLED: bool = False
    CB_FAILURE_THRESHOLD: int = 5
    CB_COOLDOWN_SEC: int = 30
    # Enhanced circuit breaker for timeout scenarios
    CB_TIMEOUT_THRESHOLD: int = 3      # Timeouts before opening breaker
    CB_TIMEOUT_COOLDOWN: int = 60      # Cooldown after timeout surge
    CB_HEALTH_CHECK_INTERVAL: int = 10 # More frequent health checks
    # Upstream health checks
    # TTL must be > POLL_SEC to avoid gaps where healthy models appear unhealthy
    HEALTH_CHECK_TTL_SEC: int = 30  # How long health data is valid (should be 2x poll interval)
    HEALTH_CHECK_PATH: str = "/health"
    HEALTH_POLL_SEC: int = 10  # How often to poll (reduced from 15 for faster updates)
    # OpenTelemetry (optional)
    OTEL_ENABLED: bool = False
    OTEL_SERVICE_NAME: str = "cortex-gateway"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""
    # Token estimation (when engines don't return usage)
    TOKEN_ESTIMATION_ENABLED: bool = True
    # Prometheus
    PROMETHEUS_URL: str = "http://prometheus:9090"
    # CORS & security headers
    CORS_ENABLED: bool = True
    # For cookie auth to work across origins, this must NOT be "*"; set your frontend origin.
    # Docker Compose automatically sets this to detected host IP + localhost fallbacks.
    # Format: comma-separated origins, e.g., "http://192.168.1.50:3001,http://localhost:3001"
    CORS_ALLOW_ORIGINS: str = "http://localhost:3001,http://127.0.0.1:3001"  # Override via env
    SECURITY_HEADERS_ENABLED: bool = True
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://cortex:cortex@postgres:5432/cortex"
    # Admin bootstrap
    ADMIN_BOOTSTRAP_USERNAME: str = ""
    ADMIN_BOOTSTRAP_PASSWORD: str = ""
    ADMIN_BOOTSTRAP_ORG: str = ""
    # Models & vLLM
    # Container-visible paths (mounted inside gateway)
    CORTEX_MODELS_DIR: str = "/var/cortex/models"
    HF_CACHE_DIR: str = "/var/cortex/hf-cache"
    # Export directory for Deployment page (should be host-mounted for persistence)
    CORTEX_EXPORT_DIR: str = "/var/cortex/exports"
    CORTEX_EXPORT_DIR_HOST: str | None = None
    # Comma-separated container paths where transfer drives are mounted (bundles are read/written under these)
    CORTEX_TRANSFER_DIRS: str = "/var/cortex/exports,/host/media,/host/mnt,/host/run/media"
    # Infra images (postgres, redis, prometheus, ...) as pinned in versions.env; passed by compose for bundle exports
    CORTEX_INFRA_IMAGES: str = ""
    CORTEX_VERSION: str = "dev"
    # Host paths (used when creating vLLM containers via Docker SDK)
    CORTEX_MODELS_DIR_HOST: str | None = None
    HF_CACHE_DIR_HOST: str | None = None
    # Docker image versions (pinned for reproducibility and offline compatibility)
    # Update these versions periodically, then run 'make prepare-offline' to cache
    # IMPORTANT:
    # - Qwen3 models require newer Transformers (the Qwen3 config.json requires >= 4.51)
    # - Keep this pinned to the same version used by scripts/prepare-offline-deployment.sh
    # For Qwen3 offline deployments, update the offline package to a compatible vLLM tag, then set VLLM_IMAGE accordingly.
    # Pinned engine images (keep in sync with versions.env and the offline package).
    # vLLM v0.28.0: CUDA 13 base image, requires NVIDIA driver >= 580. Use the -cu129 tag for older drivers.
    VLLM_IMAGE: str = "vllm/vllm-openai:v0.28.0"
    # llama.cpp settings
    # Use official llama.cpp server with CUDA support
    # The 'server-cuda' tag includes CUDA-compiled llama-server binary
    # llama.cpp build b10731 (server-cuda, CUDA 12.8). `server-cuda` without a build number floats daily.
    LLAMACPP_IMAGE: str = "ghcr.io/ggml-org/llama.cpp:server-cuda-b10731"
    
    # Offline/Air-gapped deployment settings
    OFFLINE_MODE: bool = False  # Set True to prevent internet access for image pulls
    OFFLINE_MODE_AUTO_DETECT: bool = True  # Auto-detect network availability
    REQUIRE_IMAGE_PRECACHE: bool = False  # Strict mode: fail if image not locally cached
    IMAGE_PULL_TIMEOUT: int = 600  # Seconds to wait for image pull (10 minutes)
    LLAMACPP_GEN_URLS: str = ""
    # Server-side timeout controls for multi-user stability
    LLAMACPP_SERVER_TIMEOUT: int = 300  # 5 minutes max per request
    # Monitoring and observability (Gap #1)
    LLAMACPP_METRICS_ENABLED: bool = True  # Enable Prometheus /metrics endpoint
    LLAMACPP_SLOTS_ENABLED: bool = True    # Enable /slots endpoint for slot status
    # Startup timeout configuration (Gap #2)
    LLAMACPP_STARTUP_TIMEOUT: int = 300    # Default 5 minutes for model loading
    VLLM_STARTUP_TIMEOUT: int = 600        # Default 10 minutes for vLLM model loading
    LLAMACPP_LOG_TIMESTAMPS: bool = True   # Enable timestamps in log messages
    # Lifecycle
    STOP_MODELS_ON_SHUTDOWN: bool = False  # Stop managed model containers when the gateway shuts down
    MODEL_RECONCILE_SEC: int = 15          # How often the supervisor reconciles DB state with containers

    def gen_urls(self) -> List[str]:
        return [u.strip() for u in self.VLLM_GEN_URLS.split(",") if u.strip()]

    def emb_urls(self) -> List[str]:
        return [u.strip() for u in self.VLLM_EMB_URLS.split(",") if u.strip()]

    def llamacpp_gen_urls(self) -> List[str]:
        return [u.strip() for u in self.LLAMACPP_GEN_URLS.split(",") if u.strip()]

    def all_gen_urls(self) -> List[str]:
        """Combined vLLM and llama.cpp generation URLs."""
        return self.gen_urls() + self.llamacpp_gen_urls()

    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Fallback host paths to container paths if not provided
    if not s.CORTEX_MODELS_DIR_HOST:
        s.CORTEX_MODELS_DIR_HOST = s.CORTEX_MODELS_DIR
    if not s.HF_CACHE_DIR_HOST:
        s.HF_CACHE_DIR_HOST = s.HF_CACHE_DIR
    return s