---
description: "Use when planning a new feature, bug fix, improvement, or refactor. Covers diagnostic analysis, phased implementation plan, documentation updates, verification steps, and decision tracking. Always follow this protocol before starting implementation."
applyTo: "**"
---

# Task Planning Protocol

Before writing any code, always produce a structured plan using the sections below. Present the plan to the user and wait for approval before implementing.

---

## 1. Diagnostics

Start by exploring the codebase to understand the current state.

- **Root cause**: What is the underlying reason the issue exists or the feature is missing?
- **Gaps identified**: What is missing, broken, or inconsistent? List each gap separately.
- Cite specific file paths and function/component names where the gap lives.

Example format:

> **Root cause**: `deleteMembershipFee` sets `status: "closed"` but never dismisses notifications. `getUserPendingPayments` queries only `dismissed == false` without checking fee status.
>
> **Gaps**:
>
> 1. Close-fee function does not dismiss unpaid member notifications
> 2. `getUserPendingPayments` has no safety-net check against fee status

---

## 2. Plan (phased)

Divide the work into numbered phases. Each phase groups logically related changes.

### Phase 1 — Backend / Core logic

List the specific changes needed in Cloud Functions, services, utilities, or stores.
For each change state: file path, what to add/modify, and why.

### Phase 2 — Frontend

List screen and component changes. Note any new state, navigation params, or store interactions.

### Phase 3 — Tests

For every new function or changed behaviour, identify which test file gets new tests.
List each test case with: what it sets up, what it calls, and what it asserts.
Always check `functions/test/` for backend tests and note which `describe` block to add to.

### Phase 4 — Docs

- **ARCHITECTURE.md**: Which sections need updating? (screen descriptions, function tables, file trees)
- **TESTING.md**: Update test counts and add new test descriptions to the catalogue

---

## 3. Relevant Files

List every file that will be created or modified, with a one-line reason.

| File                                            | Change type | Reason                          |
| ----------------------------------------------- | ----------- | ------------------------------- |
| `functions/src/payments/deleteMembershipFee.ts` | Modify      | Dismiss notifications on close  |
| `functions/test/fee-management.test.ts`         | Modify      | Add dismiss-on-close tests      |
| `ARCHITECTURE.md`                               | Modify      | Document new behaviour          |
| `TESTING.md`                                    | Modify      | Update test count and catalogue |

---

## 4. Verification

Describe exactly how to confirm the change works end-to-end:

- Manual steps in the app (what to tap, what to expect)
- Test command to run: `cd functions && npm run test:ci`
- Any edge cases to verify manually

---

## 5. Decisions

If there are trade-offs or alternative approaches, list them explicitly so the user can choose.

| Decision       | Option A                                                 | Option B                                            | Recommendation                       |
| -------------- | -------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| Query strategy | Collection-group query (single sweep, handles guardians) | Per-member loop (established pattern, no new index) | Option A — cleaner and guardian-safe |

---

## Rules

- **Never skip the diagnostic phase** — always read the relevant code before planning.
- **Never implement before the user approves the plan.**
- **Keep phases separate** — don't mix backend changes with test changes in one step.
- **Tests are not optional** — every behaviour change must have a corresponding test added or updated.
- **Docs are not optional** — ARCHITECTURE.md and TESTING.md must be updated as part of every task.
- If the scope is small (single-line fix, typo, translation key), skip the full protocol and just implement.
