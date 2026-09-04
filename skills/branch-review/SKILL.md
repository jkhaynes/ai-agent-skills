---
name: branch-review
description: Review the current branch's code changes before opening or updating a pull request. Identify required fixes and optional improvements across correctness, security, maintainability, testing, architecture, data access, API behavior, and scope. Do not modify code unless explicitly asked.
---

# Branch Review

Perform a senior-engineer review of the current branch.

The purpose of this review is to determine whether the branch is ready to merge and to identify both required fixes and worthwhile optional improvements.

Do not modify application code as part of this skill.

## Determine the review scope

1. Determine the current branch.
2. Determine the base branch.
   - If the user supplied a base branch, use it.
   - Otherwise identify the repository's default or appropriate base branch.
3. Inspect the diff between the current branch and base branch.
4. Review only changes introduced by the current branch and issues directly caused or exposed by those changes.
5. Read relevant repository guidance before reviewing, including when present:
   - `AGENTS.md`
   - `README.md`
   - architecture documentation
   - coding standards
   - feature/specification documents
   - `.specify/memory/constitution.md`

If the user supplied a specific review focus, prioritize it without skipping the standard review checks.

## Review priorities

### 1. Correctness

Look for logic errors, incorrect assumptions, missing edge cases, null handling problems, incomplete error handling, race conditions, inconsistent state, and behavior that does not satisfy feature requirements.

### 2. Security and privacy

Look for exposed secrets, authorization or authentication problems, unsafe input handling, injection risks, sensitive data exposure, PII in logs, and insecure defaults.

### 3. Scope

Look for unrelated changes, unnecessary infrastructure, premature abstractions, unnecessary features, excessive complexity, and work beyond the intended feature scope.

Distinguish between changes that must be corrected and improvements that are merely worthwhile.

### 4. Architecture and maintainability

Look for SOLID violations, unnecessary coupling, poor separation of concerns, meaningful duplication, difficult-to-test design, inconsistent patterns, and abstractions that make the code harder rather than easier to maintain.

Do not report preference-only refactoring as a required finding.

### 5. Data access

When applicable, look for inefficient queries, unnecessary materialization, missing `AsNoTracking` for read-only Entity Framework queries, N+1 queries, unnecessary database round trips, incorrect transaction boundaries, concurrency problems, and persistence behavior that does not match the intended workflow.

### 6. Testing

Treat missing or inadequate test coverage as a first-class review concern.

Evaluate whether the changes have appropriate unit, integration, and end-to-end tests.

Look for missing regression coverage, missing edge/error-path tests, weak assertions, brittle tests, excessive mocking that hides integration problems, important workflows with no higher-level coverage, and implementation design that is unnecessarily difficult to test.

Do not require every change to have all three test layers. Determine which layers are appropriate for the risk and behavior being changed.

### 7. API behavior

When applicable, look for accidental breaking changes, incorrect status codes, missing validation, inconsistent DTOs or API patterns, incorrect async behavior, missing cancellation handling, and contract changes not reflected in tests.

## Finding classification

Every actionable finding must have a stable finding ID, severity, and remediation classification.

### Finding ID

Assign sequential IDs: `BR-001`, `BR-002`, `BR-003`.

IDs must be unique within the review. Do not reuse an ID for a different finding.

### Severity

Use exactly one: **Critical**, **High**, **Medium**, **Low**.

Severity describes the impact of the problem.

### Remediation classification

Separately classify each finding as **Required** or **Optional**.

Use **Required** when the finding represents a real merge-readiness problem, including incorrect behavior, security/privacy risk, data-integrity risk, meaningful regression risk, missing required validation, broken API behavior, unsafe architecture, or missing tests needed to establish confidence in changed behavior.

A Low-severity finding may still be Required.

Use **Optional** when the branch can safely merge without the change but the improvement may still be worthwhile, such as useful cleanup, small maintainability improvements, nonessential refactoring, additional defensive coverage, simplification, or minor performance improvements without a demonstrated problem.

## Recommendations for optional findings

Every Optional finding must include `Recommended: Yes` or `Recommended: No` plus a brief reason.

Recommend **Yes** when the improvement meaningfully reduces defect risk, closes a useful testing gap, removes meaningful duplication, concretely improves maintainability, prevents a likely regression, or has clear value relative to its scope.

Recommend **No** when it is primarily stylistic preference, speculative abstraction, premature optimization, unrelated cleanup, significant scope expansion, or low-value refactoring.

This recommendation is advisory. The user decides whether Optional findings are implemented.

## Do not

- Modify files.
- Fix findings.
- Create implementation tasks.
- Nitpick formatting handled by tooling.
- Recommend preference-only rewrites without concrete benefit.
- Introduce abstractions without demonstrated value.
- Expand feature scope.
- Treat optional improvements as blockers.
- Classify something as Required merely because it would make the code nicer.

## Output

Start with:

# Code Review

## Verdict

Use exactly one:

- **PASS** — no Required findings and no meaningful Optional findings.
- **PASS WITH SUGGESTIONS** — no Required findings, but one or more worthwhile Optional findings exist.
- **CHANGES REQUESTED** — one or more Required findings exist.

## Findings

Order findings by Required before Optional, then severity, then finding ID.

For Required findings use:

### BR-001 — High — Required

**File:** `path/to/file.cs:line`

**Problem:** Explain the concrete problem.

**Why it matters:** Explain the consequence or risk.

**Recommendation:** Explain the smallest appropriate correction.

For Optional findings use:

### BR-004 — Low — Optional

**File:** `path/to/file.cs:line`

**Problem:** Explain the improvement opportunity.

**Why it matters:** Explain the concrete benefit.

**Recommendation:** Explain the suggested change.

**Recommended:** Yes

**Reason:** Briefly explain why the optional work is or is not worth taking on.

Do not create findings merely to fill the report.

If there are no meaningful issues, explicitly say: `No blocking or significant issues found.`

## Scope Check

State whether the branch remains within the intended feature scope and call out unnecessary or unrelated changes.

## Test Assessment

Assess the branch's current unit, integration, and E2E coverage. Identify important missing coverage as findings rather than burying it only in this section.

## Summary

Summarize the number of Required findings, number of Optional findings, overall merge readiness, and the most important risk if any.

If there are Optional findings, note that `review-remediation` can be used to select which optional improvements should become Spec Kit tasks.
