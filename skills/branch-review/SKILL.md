---
name: branch-review
description: Review the current branch's code changes before opening or updating a pull request. Look for correctness, bugs, security issues, maintainability problems, missing tests, architecture violations, and unnecessary scope. Do not modify code unless explicitly asked.
---

# Code Review

Perform a senior-engineer review of the current branch.

## Determine what to review

1. Identify the repository's default/base branch.
2. Inspect the diff between the current branch and the base branch.
3. Review only changes introduced by the current branch unless surrounding code is necessary to understand the change.
4. Read repository-level instructions such as:
   - AGENTS.md
   - README.md
   - architecture documentation
   - coding standards
   - relevant feature/spec documents

## Review priorities

Review in this order:

1. Correctness
   - Logic errors
   - Edge cases
   - Null/error handling
   - Incorrect assumptions
   - Race conditions or concurrency issues

2. Security and privacy
   - Secrets
   - Authentication/authorization mistakes
   - Unsafe input handling
   - PII exposure
   - Logging of sensitive information

3. Scope
   - Changes unrelated to the feature
   - Premature abstractions
   - Unnecessary infrastructure
   - Features not required by the current specification
   - Significant increase in complexity without clear value

4. Architecture and maintainability
   - SOLID violations
   - Tight coupling
   - Poor separation of concerns
   - Duplicate logic
   - Hard-to-test designs
   - Inconsistent patterns compared with the existing codebase

5. Data access
   - Inefficient queries
   - Missing AsNoTracking for read-only Entity Framework queries
   - N+1 queries
   - Excessive database round trips
   - Incorrect transaction behavior

6. Testing
   - Missing tests for new behavior
   - Tests that don't actually prove the behavior
   - Missing edge/error cases
   - Brittle tests
   - Implementation written in a way that makes testing unnecessarily difficult

7. API behavior
   - Breaking contract changes
   - Incorrect status codes
   - Poor validation
   - Inconsistent DTO/API patterns
   - Missing cancellation or async handling where appropriate

## Do not

- Nitpick formatting already handled by tooling.
- Suggest large rewrites purely based on preference.
- Recommend abstractions without a concrete benefit.
- Expand the feature beyond its documented requirements.
- Treat optional improvements as blockers.
- Modify files during the review.

## Output

Start with:

# Code Review

## Verdict

Choose exactly one:

- PASS
- PASS WITH SUGGESTIONS
- CHANGES REQUESTED

Then provide:

## Findings

For each actual issue:

### [Critical | High | Medium | Low] Short title

**File:** path/to/file.cs:line

**Problem:** Explain what is wrong.

**Why it matters:** Explain the practical consequence.

**Recommendation:** Give a concrete fix.

Do not create findings merely to fill the report.

If there are no meaningful issues, explicitly say:

"No blocking or significant issues found."

Then provide:

## Scope Check

State whether the branch appears appropriately scoped for the feature.

## Test Assessment

State whether the tests adequately cover the changed behavior.

## Summary

Give a short senior-engineer assessment of whether this branch is ready to merge.
