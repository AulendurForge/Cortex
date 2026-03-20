# Opus Prompt: Holistic Full-Stack Bug and Risk Review (Cortex)

Use the following prompt with Opus exactly as written, then replace bracketed placeholders as needed.

---

You are conducting a **holistic, full-stack software review** for the Cortex repository.

## Mission
Perform an end-to-end audit to identify:
- Functional bugs
- Security issues
- Reliability and resilience gaps
- Performance bottlenecks and scalability risks
- Data integrity and consistency issues
- API contract mismatches
- UX/accessibility defects that cause user-visible failures
- Deployment/operations risks (config, observability, rollback, backup, migrations)
- Test and CI/CD coverage gaps that let defects escape

Prioritize findings by **likelihood**, **impact**, and **execution priority**, then produce a complete report with actionable remediation guidance.

## Repo and Environment Context
- Repo name: `Cortex`
- Primary stacks: [fill in if needed]
- Deployment targets: [fill in if needed]
- Critical business flows: [list top 3-8]
- Known constraints: [latency, compliance, infra limits, deadlines]

## Review Rules
1. Be concrete and evidence-driven. Do not give generic advice.
2. For every issue, include file/symbol/function references.
3. Prefer issues with clear user/business impact.
4. Call out uncertainty explicitly if confidence is low.
5. Note false-positive risk when relevant.
6. Include both quick wins and deeper systemic fixes.
7. Do not skip low-level details that can cause production incidents.

## Audit Scope (Do All)
1. **Frontend**
   - Rendering/state issues, race conditions, stale cache, broken loading/error states
   - Validation, authz/authn handling, unsafe client assumptions
   - Accessibility failures that block workflows
2. **Backend/API**
   - Input validation, authn/authz, broken access control
   - Error handling, retries/timeouts/circuit breaking
   - Idempotency, concurrency, transaction boundaries
   - API schema/response consistency and backward compatibility
3. **Data Layer**
   - Migration safety, rollbackability, data corruption risks
   - Query correctness/perf, indexing, N+1 patterns
   - Data lifecycle and integrity constraints
4. **Security**
   - OWASP Top 10 style checks (injection, auth issues, secret exposure, SSRF, XSS, CSRF, insecure defaults)
   - Dependency and supply-chain concerns
5. **Infrastructure/Operations**
   - Misconfiguration risks, secrets handling, least privilege
   - Logging/metrics/tracing coverage, alert quality
   - Backup/restore, disaster recovery, deploy rollback gaps
6. **Testing/Quality**
   - Missing tests around critical flows and regressions
   - CI quality gates and failure blind spots

## Required Output Format

Return output in the exact structure below.

### 1) Executive Summary
- Top 5 risks in plain language
- Overall risk posture: `Low | Medium | High | Critical`
- Why this matters now (customer/business/operations impact)

### 2) Prioritized Findings Table
Use one row per finding with these columns:

`ID | Title | Layer | Likelihood (1-5) | Impact (1-5) | Exploitability (1-5) | Blast Radius (1-5) | Detectability (1-5, inverse) | Confidence (1-5) | Priority Score | Severity Tier | Evidence | Affected Components | User/Business Impact | Repro Steps | Recommended Fix | Effort (S/M/L) | Owner Suggestion`

Scoring guidance:
- `Priority Score = (Likelihood * Impact) + Exploitability + Blast Radius + Detectability + Confidence`
- Severity tiers:
  - `Critical`: >= 30
  - `High`: 24-29
  - `Medium`: 17-23
  - `Low`: <= 16

### 3) Findings by Severity
Group by `Critical`, `High`, `Medium`, `Low`, each item including:
- What is wrong
- Where it is (file, function, endpoint, job, config)
- Why it happens (root cause)
- Reproduction path
- Short-term mitigation
- Long-term fix
- Regression test to add

### 4) Cross-Cutting Patterns
Identify recurring root causes across findings, such as:
- Inconsistent validation strategy
- Missing boundary checks
- Weak observability around failures
- Overly broad permissions
- Tight coupling that causes cascading failures

For each pattern, propose one structural remediation.

### 5) Remediation Roadmap
Produce a phased plan:
- `Phase 0 (Immediate containment, 24-48h)`
- `Phase 1 (High-value fixes, 1-2 weeks)`
- `Phase 2 (Systemic hardening, 1-2 months)`

For each phase, include:
- Issue IDs addressed
- Dependencies and sequencing
- Expected risk reduction
- Validation/test plan

### 6) Verification and Test Matrix
For top findings, provide:
- Unit tests to add
- Integration/e2e tests to add
- Synthetic/runtime checks and alerts
- Rollout strategy (feature flag/canary/rollback trigger)

### 7) Open Questions / Assumptions
List any assumptions that could change prioritization.

## Review Quality Bar
Before finalizing, self-check:
- Did I cover all major layers (frontend/backend/data/security/ops/testing)?
- Are top-priority findings reproducible and evidence-backed?
- Is prioritization tied to likelihood and business impact?
- Are fixes actionable with clear owner suggestions and effort sizing?

If any check fails, iterate once and improve the report before returning final output.

---

Optional preface to prepend when running:

"Focus on practical, high-signal findings and avoid filler. If two issues are similar, merge them and rank by real-world impact."
