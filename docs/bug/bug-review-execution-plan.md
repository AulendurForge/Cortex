# Cortex Bug Review Execution Plan

This plan is for working through the Opus full-stack audit output in a consistent, decision-ready way.

## Goals
- Turn findings into prioritized, verifiable fixes.
- Balance urgency (risk reduction) with delivery reality (team capacity and dependencies).
- Prevent regressions by pairing each fix with test and observability updates.

## Inputs
- `docs/bug/opus-full-stack-review-prompt.md` output report
- Current sprint capacity and ownership map
- Production incident history and support ticket trends
- Existing roadmap constraints

## Triage Rubric
Use these dimensions for every issue:
- Likelihood (1-5)
- Impact (1-5)
- Exploitability (1-5)
- Blast Radius (1-5)
- Detectability (1-5, inverse: hard to detect = higher score)
- Confidence (1-5)
- Effort (`S | M | L`)
- Time Criticality (`Now | This Sprint | Next Sprint | Backlog`)

### Priority Formula
`Priority Score = (Likelihood * Impact) + Exploitability + Blast Radius + Detectability + Confidence`

Severity bands:
- `Critical` (>= 30)
- `High` (24-29)
- `Medium` (17-23)
- `Low` (<= 16)

## Workflow
1. **Ingest**
   - Import all findings into one working table.
   - Deduplicate overlapping issues.
2. **Validate**
   - Reproduce top findings (Critical/High) in a controlled environment.
   - Mark confidence adjustments after reproduction.
3. **Prioritize**
   - Apply scoring rubric and assign severity.
   - Add business context: customer-facing risk, compliance, revenue, operational risk.
4. **Plan**
   - Group by dependencies and shared root causes.
   - Split into phases (containment, near-term fixes, systemic hardening).
5. **Execute**
   - Create implementation tickets with owner + acceptance criteria.
   - Add tests and rollout safeguards for each issue.
6. **Verify**
   - Confirm fixes with test matrix and runtime validation.
   - Close only when acceptance criteria and monitoring checks pass.
7. **Learn**
   - Capture root-cause patterns and prevention actions in engineering standards.

## Working Table Template
Use this schema in your tracker:

`Issue ID | Title | Layer | Severity | Priority Score | Likelihood | Impact | Exploitability | Blast Radius | Detectability | Confidence | Effort | Owner | Status | Dependency IDs | Target Milestone | Fix PR | Test PR | Validation Evidence | Notes`

Suggested status values:
- `New`
- `Needs Repro`
- `Triaged`
- `Planned`
- `In Progress`
- `In Review`
- `Validated`
- `Closed`
- `Deferred`

## Phase Plan Template

### Phase 0: Immediate Containment (24-48h)
- Target: all Critical findings and exploit-prone High findings.
- Actions:
  - Temporary guards, kill switches, tighter permissions, rate limits, config lockdown.
  - Incident alerts and monitoring patches.
- Exit criteria:
  - Immediate blast radius reduced.
  - Runbooks updated for on-call response.

### Phase 1: High-Value Fixes (1-2 weeks)
- Target: remaining High findings and top Medium findings tied to key user flows.
- Actions:
  - Durable code/config fixes.
  - Add focused regression tests (unit + integration/e2e).
- Exit criteria:
  - Repro cases fail before fix and pass after fix.
  - No critical path regressions in staging/canary.

### Phase 2: Systemic Hardening (1-2 months)
- Target: recurring root-cause patterns and lower-severity backlog items.
- Actions:
  - Refactors, architecture guardrails, coding standards updates.
  - CI quality gates and observability maturity upgrades.
- Exit criteria:
  - Measurable drop in repeated defect classes.
  - Risk trending and SLO health improve.

## Decision Standards
For each issue, decide:
- **Fix now**: high risk and low/medium effort.
- **Fix next sprint**: high/medium risk with dependencies.
- **Defer with rationale**: low risk or low confidence; must include trigger conditions for re-open.
- **Reject as false positive**: document evidence and reviewer sign-off.

## Ticket Quality Checklist
Every implementation ticket should include:
- Problem statement and impact
- Repro steps
- Root cause hypothesis
- Proposed fix
- Acceptance criteria
- Tests to add/update
- Rollout and rollback plan
- Monitoring/alert update requirements

## Reporting Cadence
- **Daily (during active remediation):**
  - Critical/High status, blockers, newly discovered dependencies
- **Weekly:**
  - Issues opened vs closed
  - Risk reduced by severity band
  - Escaped defects and lessons learned

## Success Metrics
- Reduction in open Critical/High issues
- Mean time to remediate by severity
- Regression rate after bug fixes
- % of fixes shipped with new/updated tests
- % of fixes with monitoring coverage

## First 48-Hour Kickoff Checklist
- [ ] Run Opus prompt and capture report
- [ ] Create master tracking table with all findings
- [ ] Reproduce top 5 issues
- [ ] Confirm severity/priorities with engineering + product
- [ ] Create Phase 0 tickets with owners and ETAs
- [ ] Define validation plan and rollback criteria
