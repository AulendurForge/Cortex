# Threat Model

Assets, actors and the mitigations Cortex provides versus the ones the deployment must add.
Implementation details are in [Security](security.md).

## Assets

| Asset | Value | Where it lives |
|---|---|---|
| API keys (bcrypt hashes + prefixes), admin credentials | high | Postgres |
| Session secret | high | `SESSION_SECRET` env or `config_kv` |
| `INTERNAL_VLLM_API_KEY` | high | env; passed to every model container |
| HuggingFace tokens | medium | `models.hf_token` (plaintext), never returned by the API |
| Model weights | medium-high (licensing) | `/var/cortex/models`, HF cache |
| Usage metadata, model configuration | medium | Postgres; deployment exports |
| The Docker socket | critical | mounted into the gateway |

## Actors

| Actor | Capability |
|---|---|
| LAN client without a key | can reach `:8084` and `:3001` unless firewalled; cannot reach model engines (loopback only) |
| Holder of a valid API key | inference within scopes; rate/concurrency limited |
| Admin session holder | full control incl. starting containers with arbitrary args/env |
| Someone with shell on the host | root-equivalent through the Docker socket; everything |
| Malicious model checkpoint | code execution inside a model container (`trust_remote_code`, custom archs) |

## Trust boundaries

```
Internet / LAN ──TLS proxy (you)──► gateway :8084 (host net, non-root, docker.sock)
                                  │            └──► Docker daemon ──► model containers (127.0.0.1:<port>, --api-key)
                                  ├──► UI :3001 (loopback in prod)
                                  └──► Postgres / Redis / Prometheus (loopback)
```

## Threats and mitigations

| # | Threat | Cortex mitigation | Deployment must add |
|---|---|---|---|
| T1 | Unauthenticated inference | bcrypt-hashed keys, scopes, `GATEWAY_DEV_ALLOW_ALL_KEYS=false` default | keep dev bypass off; firewall 8084 |
| T2 | Admin takeover | signed sessions (HMAC-SHA256, expiry), `HttpOnly`/`SameSite=Lax`, bcrypt passwords, all `/admin` behind `require_admin`, bootstrap only while no admin exists | TLS + `SESSION_COOKIE_SECURE=true`, strong passwords (`make setup-admin`, 8+ characters, no defaults), SSO/VPN in front |
| T3 | Key theft / replay | shown once, revocable, per-key usage rows | short expiries, monitor usage |
| T4 | Bypassing the gateway to the engine | engine ports on `127.0.0.1` only, `--api-key` on both engines | nothing else on the host loopback should be untrusted |
| T5 | Denial of service | body size limit, rate limit, concurrency cap, per-model timeouts, circuit breaker | proxy-level limits, GPU capacity planning |
| T6 | Container escape / malicious weights | no added capabilities, ro model mount, forbidden flags/env, protected GPU env | vet checkpoints; `trust_remote_code` only for known models; keep engine images pinned and updated |
| T7 | Abuse of the Docker socket via the gateway | gateway runs non-root, only the socket group added; container args validated (`custom_arg_forbidden`, `env_var_protected`) | treat the gateway host as sensitive; no other consumers of the socket |
| T8 | Supply chain (images, wheels, models) | pinned tags in `versions.env`, offline package checksums, `make prod-check` rejects `latest` | verify digests, scan images, private registry |
| T9 | Eavesdropping | none (plain HTTP) | TLS proxy, HSTS at the proxy |
| T10 | Data exfiltration via exports/backups | `hf_token` redacted in exports | protect `/var/cortex/exports` and `backups/` |
| T11 | CSRF against admin | `SameSite=Lax` cookie, CORS allowlist with credentials | single origin behind the proxy |

## Residual risks (known gaps)

- No MFA, lockout or password policy on admin accounts.
- `hf_token` stored in plaintext.
- `/metrics` and `/health` are unauthenticated.
- No per-request content logging, hence no forensic record of prompts.
- The gateway needs the Docker socket; a gateway compromise equals host compromise.
- Model containers run with `--ipc host`.

## Risk matrix

| Threat | Likelihood | Impact | Level |
|---|---|---|---|
| T1 Unauthenticated inference | low (default off) | high | medium |
| T2 Admin takeover | low with TLS | critical | high |
| T4 Engine bypass | very low | high | low |
| T5 DoS | high | medium | medium |
| T6 Malicious weights | low | critical | medium |
| T7 Socket abuse | low | critical | medium |
| T8 Supply chain | low | high | medium |
| T9 Eavesdropping | medium without TLS | medium | medium |

## Environments

- **Development**: dev bypass on, everything on the LAN; acceptable only on a
  trusted network.
- **Air-gapped**: same controls; supply-chain risk moves to the offline package (checksums,
  `OFFLINE_MODE=true`, `REQUIRE_IMAGE_PRECACHE=true`).
- **Production**: `make prod-check` green, TLS proxy, firewalled ports, backups, monitoring.
