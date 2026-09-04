---
name: review-remediation
description: Convert selected branch-review findings into dependency-ordered remediation tasks in the active Spec Kit tasks.md. Automatically include required findings, ask the user which optional findings to include, and require test-first remediation for behavioral issues with appropriate unit, integration, and end-to-end regression coverage. Do not implement the tasks.
---

# Review Remediation

Turn findings from `branch-review` into executable Spec Kit remediation tasks.

This skill is the decision and planning step between code review and implementation. It may update the active feature's `tasks.md`. It must not implement application code.

## Workflow

Follow these phases in order:

1. Locate the Spec Kit feature.
2. Load the branch review.
3. Validate findings.
4. Resolve optional findings with the user.
5. Build the remediation set.
6. Determine implementation and test coverage.
7. Update `tasks.md`.
8. Report what was added.

Do not modify `tasks.md` before the optional-finding decision gate is complete.

## Phase 1: Locate the Spec Kit feature

Identify the active Spec Kit feature and its feature directory.

Read when present:

- `spec.md`
- `plan.md`
- `tasks.md`
- `AGENTS.md`
- `README.md`
- `.specify/memory/constitution.md`
- relevant architecture or testing documentation

Preserve the existing structure and intent of `tasks.md`.

If no active Spec Kit feature or `tasks.md` can be reliably identified, stop and explain what is missing.

## Phase 2: Load the branch review

Use the findings from the most recent `branch-review` in the current conversation or agent session.

Expect findings to have stable IDs such as `BR-001`, `BR-002`, and `BR-003`, and to be classified as Required or Optional.

If the findings are unavailable, stop and ask the user to run `branch-review` or provide its findings. Do not recreate the entire code review inside this skill.

## Phase 3: Validate findings

Before presenting options or creating tasks, inspect the current branch.

For every finding:

1. Inspect the referenced code.
2. Confirm the finding still exists.
3. Understand its root cause.
4. Check whether later branch changes already resolved it.
5. Identify the affected feature behavior.
6. Determine which existing user story or phase it belongs to.

Classify each finding as:

- **Required — unresolved**
- **Optional — unresolved**
- **Already resolved**
- **Not applicable**

Do not blindly convert review output into tasks.

## Phase 4: Optional finding decision gate

Required findings do not need individual approval. Unless the user explicitly excludes one, all unresolved Required findings are selected for remediation.

Optional findings require a user decision.

If there are no unresolved Optional findings, skip this phase.

If unresolved Optional findings exist, stop before modifying `tasks.md` and present them concisely:

```text
Optional review findings

BR-004 — Extract duplicated order validation
Recommended: Yes
Reason: Removes duplicated business rules with a small, contained change.

BR-007 — Rename OrderProcessor
Recommended: No
Reason: Primarily a naming preference with little concrete benefit.

BR-009 — Add integration coverage for retry behavior
Recommended: Yes
Reason: The behavior currently has only mocked unit coverage.
```

Then ask: `Which optional findings should I include?`

The user may answer naturally, for example:

- `4 and 9`
- `BR-004 yes, BR-007 no, BR-009 yes`
- `All recommended`
- `All optional`
- `None`

Interpret shorthand using the finding IDs.

### Selection rules

- **All recommended**: include Optional findings marked `Recommended: Yes` only.
- **All optional**: include every unresolved Optional finding.
- **None**: include no Optional findings.
- **Individual IDs**: include only the IDs explicitly approved.

Never interpret silence as approval of an Optional finding.

Do not modify `tasks.md` while any necessary optional-selection decision remains unresolved.

## Phase 5: Build the remediation set

After the decision gate, create the final remediation set containing:

1. unresolved Required findings
2. Optional findings explicitly approved by the user

Exclude declined Optional findings, unresolved Optional findings without approval, Already resolved findings, and Not applicable findings.

Before modifying `tasks.md`, summarize the decision:

```text
Selected for remediation

BR-001 — Required
BR-002 — Required
BR-004 — Optional — Approved
BR-009 — Optional — Approved

Not selected

BR-007 — Optional — Declined

Already resolved

BR-003
```

Then continue without asking for another confirmation unless a material ambiguity remains.

## Phase 6: Plan complete remediation

For each selected finding, determine the complete work necessary to resolve it.

Plan both the implementation and the evidence needed to prove the fix works.

For every selected finding explicitly evaluate:

1. implementation changes
2. regression test that demonstrates the issue before the fix, when the finding affects observable behavior
3. additional unit tests
4. integration tests
5. E2E tests

Testing is part of remediation, not an optional cleanup step after implementation.

### TDD requirement

Behavioral remediation MUST use test-first development.

For every selected behavioral finding:

1. Add or update an automated regression test that reproduces the bug, regression, or missing behavior.
2. Write the test task so the test is expected to fail against the current implementation.
3. Add the implementation task that makes that regression test pass.
4. Add any additional unit, integration, or E2E coverage needed to protect the corrected behavior.

The regression-test task MUST appear before the corresponding implementation task in `tasks.md`.

Do not use implementation-first ordering for behavioral remediation, even if the existing project, phase, or `tasks.md` uses that convention.

Existing local conventions do not override this skill's TDD requirement.

The purpose of remediation is to prove the issue exists before changing the implementation and then verify that the change resolves it.

For non-behavioral findings where an automated regression test would not meaningfully demonstrate the issue, do not invent a low-value test solely to satisfy TDD. Document why test-first reproduction is not applicable and add appropriate verification if available.

### Unit test assessment

Add or update unit tests when the behavior can be meaningfully verified at the function, class, component, service, or domain level.

Consider coverage for the regression scenario, corrected behavior, edge cases, null handling, validation, error paths, and business rules.

Do not create a generic `Add unit tests` task. Specify what behavior the tests must prove.

When TDD applies, do not describe the first test task merely as coverage added after the fix. Write it so the test captures the currently failing regression or missing behavior before the implementation change is made.

### Integration test assessment

Add or update integration tests when the finding crosses application boundaries such as API + application service, application + database, Entity Framework queries, repositories, authentication/authorization, serialization, transactions, background processing, or external integrations.

Integration tests should verify that the real participating components behave correctly together.

Do not rely entirely on mocked unit tests for behavior whose risk exists at an integration boundary.

### E2E test assessment

Add or update E2E coverage when the finding affects an important user-visible or system-level workflow, such as completing an order, picking or packing an item, authenticating, accessing protected functionality, submitting a UI workflow, completing a multi-step business process, or behavior spanning frontend, API, and persistence.

E2E tests should protect meaningful workflows, not duplicate every unit assertion.

### Choose the appropriate test layers

For every selected finding, explicitly decide:

```text
Regression: Yes/No
Unit: Yes/No
Integration: Yes/No
E2E: Yes/No
```

For behavioral findings, `Regression` should normally be `Yes` and must identify the lowest appropriate automated test layer that can reliably demonstrate the current defect before the fix.

A finding may require only a regression unit test, regression + integration, integration + E2E, all three, or another appropriate combination.

Do not mechanically add all three test types. Use the lowest useful layer to demonstrate the defect first, then add higher-level coverage where the regression risk exists across boundaries or user workflows.

If no automated regression test is appropriate for a selected finding, document why test-first reproduction is not meaningful for that finding.

## Phase 7: Create Spec Kit tasks

Translate the remediation plan into tasks in the active `tasks.md`.

Follow the file's existing Spec Kit structure except where an existing ordering convention conflicts with the TDD rules in this skill.

Use:

```text
- [ ] T### [P?] [US#?] Description with file path
```

### Task rules

1. Continue from the highest existing task ID.
2. Never reuse an ID.
3. Do not renumber existing tasks.
4. Do not delete existing tasks.
5. Do not rewrite unrelated existing tasks.
6. Use `[P]` only when tasks can genuinely run independently.
7. Use an existing `[US#]` when the remediation belongs to that user story.
8. Include concrete file paths whenever they can be determined.
9. Make each task executable without requiring the implementer to reinterpret the original review.
10. Keep implementation and meaningful test work visible as separate tasks when that improves execution clarity.
11. For behavioral findings, never create the implementation task before the regression-test task that demonstrates the issue.

Place tasks in the appropriate existing user-story or feature phase when possible. Use an existing cross-cutting/final phase for genuinely cross-cutting findings. Do not create a new user story just to hold review remediation.

### Mandatory task ordering for behavioral remediation

For behavioral findings, use this order:

1. regression test demonstrating the issue
2. implementation fix
3. additional unit or edge-case coverage
4. integration coverage
5. E2E workflow coverage

The regression test must be capable of failing against the current implementation before the fix is applied.

The implementation task depends on the regression-test task, not the reverse.

Do not change this order to match an existing implementation-first pattern elsewhere in `tasks.md`.

Existing project, phase, or task-file conventions do not override this ordering.

Do not reorder unrelated or already completed historical tasks solely to make the entire file follow TDD. Apply the TDD requirement to the new remediation tasks created by this skill.

For non-behavioral findings, use normal dependency ordering and document when test-first reproduction is not applicable.

## Example

Given:

```text
BR-002 — High — Required

Problem:
The API accepts an order quantity of zero.

Recommendation:
Reject non-positive quantities.
```

Do not create only:

```text
- [ ] T042 [US2] Fix zero quantity orders
```

Do not create implementation-first remediation such as:

```text
- [ ] T042 [US2] Reject non-positive order quantities in src/Orders/OrderService.cs
- [ ] T043 [US2] Add regression coverage for zero and negative order quantities in tests/Orders/OrderServiceTests.cs
```

Create the regression task first:

```text
- [ ] T042 [US2] Add a failing regression test proving zero and negative order quantities are currently accepted in tests/Orders/OrderServiceTests.cs
- [ ] T043 [US2] Reject non-positive order quantities in src/Orders/OrderService.cs so the regression test passes
- [ ] T044 [US2] Add API integration coverage verifying invalid quantities return the expected validation response in tests/Integration/Orders/OrderEndpointsTests.cs
- [ ] T045 [US2] Add E2E coverage proving an invalid quantity cannot be submitted through the order workflow in tests/E2E/order-creation.spec.ts
```

Only create the additional test layers justified by the actual finding and application architecture.

## Scope control

The purpose of this skill is to remediate selected review findings.

Do not:

- implement the tasks
- introduce unrelated improvements
- expand feature scope
- create speculative abstractions
- add unrelated tests
- refactor unrelated code
- silently include declined Optional findings
- turn every suggestion into mandatory work
- weaken or bypass the TDD requirement to match existing task ordering conventions

If a selected finding exposes a substantially larger architectural issue, create the smallest safe remediation plan and call out the larger issue separately rather than silently expanding scope.

## Completion report

After updating `tasks.md`, report:

### Findings processed

For each finding, indicate Added, Declined, Already resolved, or Not applicable.

### Tasks added

Report the new task ID range and number of tasks added.

### Test coverage

For each remediated finding, summarize the test decision, for example:

```text
BR-001
Regression: Added first — unit test reproduces current defect
Unit: Added
Integration: Added
E2E: Not needed — behavior does not cross a user workflow boundary
```

Call out any selected behavioral finding that did not receive a test-first automated regression task and explain why it was classified as non-behavioral or otherwise not testable.

### TDD ordering

State whether all behavioral remediation tasks were created test-first.

If any behavioral finding was not ordered regression-test first, treat that as a planning error and correct `tasks.md` before completing the skill.

### Next step

Recommend proceeding with the normal Spec Kit implementation workflow.

Do not implement the tasks as part of this skill.
