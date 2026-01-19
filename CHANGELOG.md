# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Enhanced monitoring and alerting capabilities
- Additional authentication providers
- Advanced model optimization features

---

## [0.1.1] - 2026-01-18

### Added
- **Custom Environment Variables**: Support for setting custom environment variables in model configuration
  - New "Environment Variables" tab in Custom Startup Configuration section
  - Available in both standard and workflow model forms
  - Documentation guide: `docs/models/setting-custom-env-vars.md`
  - Enables advanced vLLM features like FlashInfer MoE FP8 support
  - Enhanced `docker_manager.py` to handle custom environment variables

### Changed
- Improved model startup configuration flexibility
- Enhanced docker container startup with custom environment variable support

### Documentation
- Added comprehensive guide for setting custom environment variables (`docs/models/setting-custom-env-vars.md`)
- Cleaned up implementation gap documentation files

---

## [0.1.0-beta] - 2026-01-11

### Added

#### Core Features
- **OpenAI-compatible API Gateway**: Full compatibility with OpenAI API endpoints
  - `/v1/chat/completions` - Chat completions with streaming support
  - `/v1/completions` - Text completions
  - `/v1/embeddings` - Embedding generation
  - `/v1/models` - Model listing endpoint
- **Multi-engine Support**: Dual inference engine architecture
  - vLLM engine for standard HuggingFace Transformers models
  - llama.cpp engine for GGUF models and GPT-OSS/Harmony architecture
- **Health-aware Routing**: Intelligent request routing with health checks, circuit breaking, and retries
- **Streaming Support**: Server-sent events (SSE) with time-to-first-token (TTFT) metrics

#### Chat Playground
- Interactive web UI for testing models in real-time
- Server-side chat persistence with user-scoped sessions
- Real-time performance metrics (tokens/second, TTFT, context usage)
- Cross-device access to chat history
- Context window tracking and visualization
- Model selector with running model detection

#### Admin UI & Management
- Comprehensive admin dashboard for system management
- Model lifecycle management (create, configure, start, stop, delete)
- User and organization management with multi-tenant support
- API key management with scoped permissions
- Usage analytics dashboard with filtering and export
- System monitoring dashboard with real-time metrics
- Recipe system for model configuration templates

#### Model Management
- Pre-start VRAM estimation and validation
- Configuration dry-run for testing before deployment
- Startup diagnostics with actionable error fixes
- Model state tracking: `stopped` → `starting` → `loading` → `running` → `failed`
- Resource calculator for optimal GPU memory allocation
- Model testing endpoints for validation
- Log viewer with search and filtering

#### GGUF Support
- Smart engine guidance with automatic recommendations
- GGUF file validation and corruption detection
- Metadata extraction (architecture, context length, layers)
- Multi-part GGUF support for llama.cpp (no merge required)
- Quantization quality indicators (Q4_K_M, Q8_0, etc.)
- Architecture compatibility detection
- Speculative decoding support for llama.cpp

#### Security & Access Control
- Multi-tenant access control with organizations and users
- API key authentication with scoped permissions (chat, completions, embeddings)
- IP allowlisting for API keys
- Rate limiting (configurable per-key or per-IP)
- Concurrency limits for streaming requests
- Session-based authentication for admin UI
- Role-based access control (Admin, User)

#### Observability
- Prometheus metrics integration
- Per-model inference metrics (requests, tokens, latency)
- GPU utilization and memory monitoring
- System Monitor dashboard with:
  - Host metrics (CPU, memory, disk, network)
  - GPU metrics (utilization, temperature, memory)
  - Throughput and latency summaries
  - Per-model vLLM metrics (requests running, cache usage)
- Usage analytics with time-series data
- Request tracing with request IDs

#### Deployment & Operations
- **Offline/Air-gapped Deployment**: Full support for restricted networks
  - Package preparation script for offline environments
  - Image loading and verification tools
  - No internet required after initial package creation
- Docker Compose integration (dev and prod configurations)
- Makefile with 50+ commands for common operations
- Automatic IP detection and CORS configuration
- Database backup and restore functionality
- Deployment export/import for model migration
- Model manifest system for reproducible deployments

#### Developer Experience
- Comprehensive documentation site (MkDocs)
- Quick start guide (`START_HERE.md`)
- API documentation (OpenAI-compatible and Admin APIs)
- Architecture documentation
- Contributing guidelines
- Coding standards and ADR (Architecture Decision Records)

### Technical Details

#### Backend
- FastAPI-based gateway with async/await support
- PostgreSQL database with SQLAlchemy ORM
- Redis integration for rate limiting and caching
- Docker SDK integration for container management
- Prometheus client for metrics export
- OpenTelemetry support (optional)

#### Frontend
- Next.js 14 with React 18
- TypeScript for type safety
- Tailwind CSS for styling
- React Query for data fetching
- Real-time streaming with Server-Sent Events

#### Infrastructure
- Docker Compose for orchestration
- PostgreSQL for persistent storage
- Redis for rate limiting and caching
- Prometheus for metrics collection
- Node Exporter for host metrics (Linux)
- DCGM Exporter for GPU metrics (NVIDIA)
- cAdvisor for container metrics

### Known Limitations

- vLLM GGUF support is experimental (single-file only, requires external tokenizer)
- Some advanced vLLM features require specific engine versions
- Rate limiting requires Redis (optional but recommended for production)
- GPU monitoring requires NVIDIA drivers and DCGM (Linux only)

### Documentation

- Full documentation site: https://aulendurforge.github.io/Cortex/
- Quick start guide: `START_HERE.md`
- API reference: `docs/api/`
- Architecture guides: `docs/architecture/`
- Operations guides: `docs/operations/`

### Security

- See `docs/security/` for security posture and threat model
- Default admin credentials: `admin/admin` (change in production!)
- API keys are hashed using bcrypt
- CORS configuration for network access control

---

## Version History

- **0.1.1** (2026-01-18): Custom environment variables support
- **0.1.0-beta** (2026-01-11): First public beta release

---

## Notes

- This is a beta release. Breaking changes may occur before v1.0.0
- We welcome feedback and contributions from the community
- Report issues and feature requests on [GitHub Issues](https://github.com/AulendurForge/Cortex/issues)
- Join discussions on [GitHub Discussions](https://github.com/AulendurForge/Cortex/discussions)
- See `docs/contributing/` for contribution guidelines
- Repository: https://github.com/AulendurForge/Cortex

