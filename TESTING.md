# 🧪 Clubnizer Testing Documentation

## Table of Contents

- [Current Test Suite Overview](#current-test-suite-overview)
- [Test Infrastructure](#test-infrastructure)
- [Test Cases Catalogue](#test-cases-catalogue)
- [Coverage Gap Analysis](#coverage-gap-analysis)
- [Level 1 — Backend E2E Integration Test Plan](#level-1--backend-e2e-integration-test-plan)
- [Manual / QA Test Cases — Event Cancellation & Recurring Events](#manual--qa-test-cases--event-cancellation--recurring-events)
- [Expansion Roadmap](#expansion-roadmap)

---

## Current Test Suite Overview

| Metric           | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| **Total tests**  | ~728                                                          |
| **Test suites**  | 34                                                            |
| **Test type**    | Integration tests + pure logic unit tests                     |
| **Runner**       | Jest + ts-jest                                                |
| **Backend**      | Firebase Emulator Suite (Auth, Firestore, Functions, Storage) |
| **CI**           | GitHub Actions (`.github/workflows/functions-tests.yml`)      |
| **Avg run time** | ~65s locally                                                  |

### Test Suites

| Suite                 | File                                                  | Tests | Domain                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Club Lifecycle        | `functions/test/clubs.test.ts`                        | 10    | Create, get, update, delete + permissions                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Group Lifecycle       | `functions/test/groups.test.ts`                       | 12    | CRUD + cascade delete to subgroups                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Subgroup Lifecycle    | `functions/test/subgroups.test.ts`                    | 10    | CRUD + membership add/remove                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Members & Fees        | `functions/test/members-and-fees.test.ts`             | 14    | Member roles, club roles, fee CRUD                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Events & Attendance   | `functions/test/events.test.ts`                       | 32    | Event CRUD, RSVP (with optional comments), attendance, statistics                                                                                                                                                                                                                                                                                                                                                                                                   |
| Auth & User Mgmt      | `functions/test/auth.test.ts`                         | 18    | Account creation, profiles, verification                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Invitation Flows      | `functions/test/invitations.test.ts`                  | 21    | Send, validate, accept/reject, delete, dedup                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Guardian Flows        | `functions/test/guardian-flows.test.ts`               | 14    | Add/remove guardian, role accumulation, subgroup cascade                                                                                                                                                                                                                                                                                                                                                                                                            |
| Picture Uploads       | `functions/test/upload-pictures.test.ts`              | 11    | Upload club/group/profile pics + Firestore propagation                                                                                                                                                                                                                                                                                                                                                                                                              |
| News & Notifications  | `functions/test/news-notifications.test.ts`           | 21    | News CRUD, permissions, recipient logic, youth→guardian, role filter, selectedMemberIds, comments                                                                                                                                                                                                                                                                                                                                                                   |
| Notification Side-Fx  | `functions/test/notification-side-effects.test.ts`    | 7     | Event/invitation/fee/callable notification docs + auth/not-found errors + push degradation                                                                                                                                                                                                                                                                                                                                                                          |
| Push Notifications    | `functions/test/push-notifications.test.ts`           | 10    | sendPushNotification: no-op, multi-device, DeviceNotRegistered cleanup, channel mapping, graceful degradation                                                                                                                                                                                                                                                                                                                                                       |
| Pure Logic Unit Tests | `functions/test/unit-pure-logic.test.ts`              | ~117  | Validation, roles, limits, LOK rules, age boundaries, leader deltagarstöd, leaderBonus, subsidy estimation                                                                                                                                                                                                                                                                                                                                                          |
| LOK Cloud Functions   | `functions/test/lok.test.ts`                          | 25    | storePersonnummer, removePersonnummer, getPersonnummerStatus, updateClubRfSettings, generateLokReport, listLokReports, getLokReport, deleteLokReport, resolveReportConflict, generateKommunExport                                                                                                                                                                                                                                                                   |
| Permission Helpers    | `functions/test/permission-helpers.test.ts`           | 45    | permissionHelpers: isClubAdmin, canManageGroup, getHighestRole, etc.                                                                                                                                                                                                                                                                                                                                                                                                |
| Flat Array Helpers    | `functions/test/flat-array-helpers.test.ts`           | 24    | buildFlatArraysFromClubAccess, emptyFlatArrays, inactive filtering                                                                                                                                                                                                                                                                                                                                                                                                  |
| Event Cancel & Recur  | `functions/test/event-cancellation-recurring.test.ts` | 46    | cancelEvent, createRecurringEvent, editRecurringEvent (scope, perms)                                                                                                                                                                                                                                                                                                                                                                                                |
| Account Security      | `functions/test/account-security.test.ts`             | 30    | Token revocation, email change request/verify, email sync, password reset request/verify                                                                                                                                                                                                                                                                                                                                                                            |
| Youth Profile Admin   | `functions/test/update-youth-profile.test.ts`         | 11    | Admin update youth name/DOB, sync, guardian phone update, permissions                                                                                                                                                                                                                                                                                                                                                                                               |
| Sync Event Recipients | `functions/test/sync-event-recipients.test.ts`        | 18    | Preview/confirm sync, permissions, recurring scope, youth/guardian, creator exclusion                                                                                                                                                                                                                                                                                                                                                                               |
| Self-Leave Flows      | `functions/test/self-leave-flows.test.ts`             | 10    | Player/coach/admin self-leave, roleToRemove validation, fee cleanup on removal                                                                                                                                                                                                                                                                                                                                                                                      |
| Remove Club Admin     | `functions/test/remove-club-admin.test.ts`            | 5     | Remove another club-admin, sole-admin guard, non-admin rejected, unauthenticated                                                                                                                                                                                                                                                                                                                                                                                    |
| Delete User Account   | `functions/test/delete-user-account.test.ts`          | 8     | Happy path deletion, blocked by groups/admin/dependents, inactive access allowed, notifications cleanup                                                                                                                                                                                                                                                                                                                                                             |
| Chart of Accounts     | `functions/test/chart-of-accounts.test.ts`            | 35    | seedClubAccountingConfig (SE/NO/generic), resolveClubAccountNumbers (chart + BAS fallback), getChartOfAccounts (fetch, permissions, on-demand seeding, categories[] verification), updateChartAccount (edit, guard bank, vatRate out-of-range validation), createCustomFeeCategory (slug derivation, duplicate guards, perms, vatRate out-of-range, re-activation after soft-delete), deleteCustomFeeCategory (soft-delete, system account guard, not-found, perms) |
| Fee Management        | `functions/test/fee-management.test.ts`               | 32    | createMembershipFee (components[] API, single-component account resolution, earmarkable, multi-component sum+null-category, snapshot label/vatRate, invalid-argument guards), getMembershipFees (components field), deleteMembershipFee, updateMembershipFee, createClub country/currency                                                                                                                                                                           |
| Accounting            | `functions/test/accounting.test.ts`                   | 24    | verificationService (sequential numbering), getAccountingData (P&L totals, year filter, permissions), exportAccountingData (CSV default + format, SIE headers/entries/year-filter/empty, SAF-T XML, access control, default year)                                                                                                                                                                                                                                   |

---

## Test Infrastructure

### Running Locally

```bash
cd functions

# Option 1: Two terminals
npm run emulators          # Terminal 1 — start emulators
npm test                   # Terminal 2 — run tests

# Option 2: One command
npm run test:ci            # builds + emulators:exec + jest
```

### CI Pipeline (GitHub Actions)

Triggers on push/PR to `main` or `develop` when `functions/` changes.

**Jobs:**

1. **Integration Tests** — Emulators + Jest
2. **Lint & Type Check** — ESLint + tsc --noEmit

### Key Helper Utilities (`functions/test/helpers.ts`)

| Helper                                           | Purpose                                                      |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `createFullTestUser()`                           | Creates Auth user + Firestore user doc via emulator REST API |
| `callFunction(name, idToken, data)`              | Calls a Cloud Function over HTTP with auth                   |
| `expectFunctionError(name, idToken, data, code)` | Asserts function throws specific error code                  |
| `seedUserDocument(uid, data)`                    | Seeds/updates a user doc in Firestore emulator               |
| `getDocument(path)`                              | Reads any Firestore document                                 |
| `documentExists(path)`                           | Checks document existence                                    |
| `getFirestore()`                                 | Returns admin Firestore instance                             |
| `clearAll()`                                     | Wipes all emulator data between tests                        |

---

## Test Cases Catalogue

### 1. Club Lifecycle (`clubs.test.ts`) — 10 tests

#### createClub (4 tests)

| #   | Test                                   | What it verifies                                                                                                      |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | should create a club and return clubId | Club doc created, `isActive: true`, `createdBy` set, `allMembers` doc exists, user's `activeClubsAsAdmin` incremented |
| 2   | should reject empty club name          | Validates input — blank/whitespace name returns `invalid-argument`                                                    |
| 3   | should reject duplicate club names     | Second user creating same-named club gets `already-exists`                                                            |
| 4   | should reject unauthenticated calls    | No auth token → `unauthenticated` error                                                                               |

#### getClub (2 tests)

| #   | Test                                         | What it verifies                          |
| --- | -------------------------------------------- | ----------------------------------------- |
| 5   | should return club data                      | Returns club name and data after creation |
| 6   | should return not-found for nonexistent club | Invalid clubId → `not-found`              |

#### updateClub (2 tests)

| #   | Test                                                                  | What it verifies                                                 |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 7   | should allow club admin to update club details                        | Name, description, sport updated; Firestore doc reflects changes |
| 8   | should reject update from non-admin (permission bug fix verification) | Non-admin user → `permission-denied`; original name unchanged    |

#### deleteClub (2 tests)

| #   | Test                                            | What it verifies                                                    |
| --- | ----------------------------------------------- | ------------------------------------------------------------------- |
| 9   | should soft-delete a club (30-day grace period) | `isActive: false`, `gracePeriodDays: 30`, `deletionScheduledAt` set |
| 10  | should reject deletion from non-admin           | Player role → `permission-denied`                                   |

---

### 2. Group Lifecycle (`groups.test.ts`) — 12 tests

#### createGroup (4 tests)

| #   | Test                                             | What it verifies                                               |
| --- | ------------------------------------------------ | -------------------------------------------------------------- |
| 1   | should create a group in a club                  | Group doc, allMembers doc, club `activeGroupCount` incremented |
| 2   | should reject group creation from non-admin      | Non-admin → `permission-denied`                                |
| 3   | should reject duplicate group names in same club | Same name in same club → `already-exists`                      |
| 4   | should reject empty group name                   | Empty string → `invalid-argument`                              |

#### getGroup (2 tests)

| #   | Test                            | What it verifies                  |
| --- | ------------------------------- | --------------------------------- |
| 5   | should return group data        | Returns group name after creation |
| 6   | should reject nonexistent group | Invalid groupId → `not-found`     |

#### updateGroup (3 tests)

| #   | Test                                           | What it verifies                            |
| --- | ---------------------------------------------- | ------------------------------------------- |
| 7   | should allow club admin to update group        | Name + description updated                  |
| 8   | should allow group admin to update their group | Group-level admin (not club-admin) can edit |
| 9   | should reject update from unauthorized user    | Stranger → `permission-denied`              |

#### deleteGroup (3 tests)

| #   | Test                                    | What it verifies                                      |
| --- | --------------------------------------- | ----------------------------------------------------- |
| 10  | should soft-delete a group              | `isActive: false`, `gracePeriodDays: 30`              |
| 11  | should reject deletion from non-admin   | Player → `permission-denied`                          |
| 12  | should cascade soft-delete to subgroups | Parent delete → child subgroup also `isActive: false` |

---

### 3. Subgroup Lifecycle (`subgroups.test.ts`) — 10 tests

#### createSubGroup (4 tests)

| #   | Test                                             | What it verifies                                                |
| --- | ------------------------------------------------ | --------------------------------------------------------------- |
| 1   | should create a subgroup                         | Doc created, name correct, parent group's `subGroups[]` updated |
| 2   | should reject subgroup name shorter than 2 chars | Returns `{ success: false }`                                    |
| 3   | should reject duplicate subgroup names           | Same name → `{ success: false }`                                |
| 4   | should reject creation from unauthorized user    | Stranger → `permission-denied`                                  |

#### updateSubGroup (2 tests)

| #   | Test                                         | What it verifies             |
| --- | -------------------------------------------- | ---------------------------- |
| 5   | should update subgroup name and description  | Doc reflects new values      |
| 6   | should reject update with no fields provided | Returns `{ success: false }` |

#### deleteSubGroup (1 test)

| #   | Test                     | What it verifies                                  |
| --- | ------------------------ | ------------------------------------------------- |
| 7   | should delete a subgroup | Doc removed, parent's `subGroups[]` entry removed |

#### Subgroup Membership (3 tests)

| #   | Test                                                  | What it verifies                        |
| --- | ----------------------------------------------------- | --------------------------------------- |
| 8   | should add a group member to a subgroup               | Member appears in subgroup allMembers   |
| 9   | should remove a member from a subgroup                | Member no longer in subgroup allMembers |
| 10  | should reject adding a non-group-member to a subgroup | Non-member → `not-found`                |

---

### 4. Members & Fees (`members-and-fees.test.ts`) — 14 tests

#### addMemberToClub (2 tests)

| #   | Test                                                    | What it verifies                                |
| --- | ------------------------------------------------------- | ----------------------------------------------- |
| 1   | should add a new member to a club                       | Member appears in allMembers with correct role  |
| 2   | should add a youth member without email (needsGuardian) | Youth with guardian contacts added successfully |

#### addMemberToGroup (1 test)

| #   | Test                                        | What it verifies                   |
| --- | ------------------------------------------- | ---------------------------------- |
| 3   | should add a player to a group (club admin) | Member appears in group allMembers |

#### removeMemberFromClub (2 tests)

| #   | Test                               | What it verifies                        |
| --- | ---------------------------------- | --------------------------------------- |
| 4   | should remove a member from a club | Member no longer in allMembers          |
| 5   | should return error for non-member | Nonexistent user → `{ success: false }` |

#### updateMemberRole (3 tests)

| #   | Test                                            | What it verifies                                                |
| --- | ----------------------------------------------- | --------------------------------------------------------------- |
| 6   | should add a coach role to a group member       | `updatedRoles` contains both `player` and `coach`               |
| 7   | should remove a role from a group member        | `coach` removed, `player` retained                              |
| 8   | should reject non-manageable roles (club-admin) | Trying to add `club-admin` via role update → `invalid-argument` |

#### updateClubMemberRole (2 tests)

| #   | Test                               | What it verifies                      |
| --- | ---------------------------------- | ------------------------------------- |
| 9   | should add a role at club level    | `updatedRoles` includes `coach`       |
| 10  | should remove a role at club level | `coach` removed from club-level roles |

#### Membership Fees (4 tests)

| #   | Test                                                          | What it verifies                                           |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| 11  | should create a membership fee and assign to targeted members | Fee doc created, amount/currency correct, members assigned |
| 12  | should reject fee creation from non-admin                     | Non-admin → `permission-denied`                            |
| 13  | should reject invalid currency                                | Currency "xyz" → `invalid-argument`                        |
| 14  | should list membership fees for a club                        | `getMembershipFees` returns created fee                    |

---

### 5. Events & Attendance (`events.test.ts`) — 32 tests

#### createEventV2 (6 tests)

| #   | Test                                                      | What it verifies                                                 |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | should create a group-level event                         | Event doc created with correct title, type, dates, group context |
| 2   | should create different event types (social, match, etc)  | Social, match event types accepted and stored correctly          |
| 3   | should reject event creation with missing required fields | Missing title → `invalid-argument`                               |
| 4   | should reject unauthenticated event creation              | No auth → `unauthenticated` or `internal`                        |
| 5   | should reject event creation from non-admin member        | Player role → `permission-denied`                                |
| 6   | should allow invited members to respond to events         | Member can RSVP to event created in their group                  |

#### getEvent (2 tests)

| #   | Test                            | What it verifies                       |
| --- | ------------------------------- | -------------------------------------- |
| 7   | should return an existing event | Returns event data with correct title  |
| 8   | should handle nonexistent event | Invalid eventId → `not-found` or error |

#### updateEvent (3 tests)

| #   | Test                                            | What it verifies                              |
| --- | ----------------------------------------------- | --------------------------------------------- |
| 9   | should allow creator to update event            | Title + description updated in Firestore      |
| 10  | should reject update from non-creator           | Non-creator → `permission-denied`             |
| 11  | should reject update with missing required data | Missing eventId → `invalid-argument` or error |

#### deleteEvent (2 tests)

| #   | Test                                             | What it verifies                  |
| --- | ------------------------------------------------ | --------------------------------- |
| 12  | should soft-delete an event (set isActive:false) | `isActive: false` in Firestore    |
| 13  | should reject deletion from non-creator          | Non-creator → `permission-denied` |

#### updateEventResponse / RSVP (8 tests)

| #   | Test                                            | What it verifies                                     |
| --- | ----------------------------------------------- | ---------------------------------------------------- |
| 14  | should accept an event invitation               | Response recorded as `accepted` in event responses   |
| 15  | should decline an event invitation              | Response recorded as `declined`                      |
| 16  | should reject invalid response value            | Invalid string → `invalid-argument`                  |
| 17  | should store comment when accepting             | Comment persisted in response object                 |
| 18  | should store comment when declining             | Comment persisted with decline response              |
| 19  | should accept without comment (backward compat) | No comment field → response works, comment undefined |
| 20  | should reject comment exceeding 100 chars       | 101+ chars → `invalid-argument`                      |
| 21  | should allow updating comment on re-response    | Changed response updates comment too                 |

#### recordAttendance (4 tests)

| #   | Test                                                | What it verifies                                  |
| --- | --------------------------------------------------- | ------------------------------------------------- |
| 22  | should record attendance and complete an event      | Event `status` set to `completed`, records stored |
| 23  | should reject attendance recording from non-admin   | Non-admin → `permission-denied`                   |
| 24  | should reject recording for already completed event | Already completed → `failed-precondition`         |
| 25  | should handle empty attendance records              | Empty array → error or handles gracefully         |

#### getStatistics (3 tests)

| #   | Test                                           | What it verifies                              |
| --- | ---------------------------------------------- | --------------------------------------------- |
| 26  | should return statistics for empty group       | Returns stats object (zero counts)            |
| 27  | should handle missing required fields          | Missing groupId → `invalid-argument` or error |
| 28  | should reject non-member requesting statistics | Non-member → `permission-denied`              |

#### createEventV2 – selectedMemberIds (4 tests)

| #   | Test                                                              | What it verifies                                                               |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 29  | should invite only selected members when selectedMemberIds given  | Only selected member UIDs appear in responses; creator still in invitedUserIds |
| 30  | should invite all members when selectedMemberIds is empty/omitted | All 4 group members appear in responses                                        |
| 31  | should ignore invalid selectedMemberIds (not in group)            | Non-existent UIDs silently filtered out                                        |
| 32  | should combine selectedMemberIds with roleFilter                  | roleFilter narrows first, then selectedMemberIds narrows further               |

---

### 5b. Event Cancellation & Recurring Events (`event-cancellation-recurring.test.ts`) — 46 tests

#### cancelEvent (16 tests)

| #   | Test                                                           | What it verifies                                                          |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | should cancel a single event                                   | status → `cancelled`, `cancelledBy` set, `cancelledCount` = 1             |
| 2   | should cancel with a cancellation reason                       | `cancellationReason` stored on event doc                                  |
| 3   | should reject cancelling an already cancelled event            | Already cancelled → `failed-precondition`                                 |
| 4   | should reject cancelling a completed event                     | Completed → `failed-precondition`                                         |
| 5   | should reject cancelling a non-existent event                  | Invalid eventId → `not-found`                                             |
| 6   | should reject unauthenticated cancel request                   | No auth → `unauthenticated`                                               |
| 7   | should reject cancel by a regular player                       | Player role → `permission-denied`                                         |
| 8   | should allow group coach to cancel event                       | Coach cancels successfully, `cancelledBy` = coach UID                     |
| 9   | should reject when missing required fields                     | Missing eventId → `invalid-argument`                                      |
| 10  | should cancel a single recurring occurrence (scope=single)     | Only target occurrence cancelled; others remain `scheduled`               |
| 11  | should cancel this and all future occurrences (scope=future)   | All future occurrences cancelled; earlier ones unchanged                  |
| 12  | should skip individually modified occurrences in future scope  | Modified occurrence retains `scheduled` status during future cancellation |
| 13  | should update master status when all cancelled from start      | Master doc `status` → `cancelled` when all occurrences cancelled          |
| 14  | event should remain visible (isActive=true) after cancellation | `isActive` stays `true`, `status` is the source of truth                  |
| 15  | non-recurring event should NOT have isRecurring in Firestore   | Standard event doc has no `isRecurring` / `recurringEventId`              |
| 16  | cancelling recurring event without scope cancels only one      | Omitting scope/recurringEventId falls through to single-cancel path       |

#### createRecurringEvent (16 tests)

| #   | Test                                                         | What it verifies                                                     |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| 17  | should create a weekly recurring event with 4 occurrences    | Master + 4 event docs created, correct return shape                  |
| 18  | should create master document with correct fields            | Master has frequency, endType, occurrenceEventIds, targetScope, etc. |
| 19  | should create each occurrence with correct recurring fields  | `isRecurring`, `recurringEventId`, `occurrenceIndex`, `isModified`   |
| 20  | should create occurrences with correct date spacing (weekly) | Each occurrence ~7 days apart                                        |
| 21  | should create biweekly recurring events                      | 3 occurrences ~14 days apart                                         |
| 22  | should create monthly recurring events                       | 3 occurrences ~28-31 days apart                                      |
| 23  | should include creator in invitedUserIds                     | Creator UID present in occurrence `invitedUserIds`                   |
| 24  | should reject unauthenticated request                        | No auth → `unauthenticated`                                          |
| 25  | should reject missing required fields                        | Missing fields → `invalid-argument`                                  |
| 26  | should reject invalid occurrenceCount (< 2)                  | count = 1 → `invalid-argument`                                       |
| 27  | should reject invalid occurrenceCount (> 52)                 | count = 100 → `invalid-argument`                                     |
| 28  | should require seriesEndDate when endType is 'date'          | Missing seriesEndDate → `invalid-argument`                           |
| 29  | should require occurrenceCount when endType is 'occurrences' | Missing occurrenceCount → `invalid-argument`                         |
| 30  | should reject a regular player creating recurring events     | Player role → `permission-denied`                                    |
| 31  | should allow a group coach to create recurring events        | Coach creates successfully                                           |
| 32  | should create occurrences based on seriesEndDate             | `endType: "date"` generates correct number of occurrences            |

#### editRecurringEvent (14 tests)

| #   | Test                                                          | What it verifies                                            |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 33  | should edit a single occurrence and mark it as modified       | Title changed, `isModified: true`; others unchanged         |
| 34  | should edit description of a single occurrence                | `description` updated, `isModified: true`                   |
| 35  | should edit location of a single occurrence                   | `location` updated                                          |
| 36  | should edit this and all future occurrences (scope=future)    | Future occurrences updated, past ones unchanged             |
| 37  | should skip individually modified occurrences in future scope | Modified occurrence keeps its custom values                 |
| 38  | should update master document when using future scope         | Master doc `title` and `location` updated                   |
| 39  | should skip cancelled occurrences in future scope             | Cancelled occurrence keeps old title and `cancelled` status |
| 40  | should reject invalid scope value                             | scope = `"all"` → `invalid-argument`                        |
| 41  | should reject when event does not exist                       | Invalid eventId → `not-found`                               |
| 42  | should reject when recurring master does not exist            | Fake master ID → `not-found`                                |
| 43  | should reject missing required fields                         | Empty data → `invalid-argument`                             |
| 44  | should reject unauthenticated request                         | No auth → `unauthenticated`                                 |
| 45  | should reject edit by regular player                          | Player role → `permission-denied`                           |
| 46  | should allow group coach to edit recurring events             | Coach edits successfully                                    |

---

### 5c. Sync Event Recipients (`sync-event-recipients.test.ts`) — 18 tests

#### preview mode (3 tests)

| #   | Test                                                  | What it verifies                                                  |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | should return empty diff when all members are in sync | `added: []`, `removed: []`, `unchanged >= 1`                      |
| 2   | should detect newly added group member as 'added'     | New member appears in `added[]` after joining group post-creation |
| 3   | should detect removed group member as 'removed'       | Deactivated member appears in `removed[]`                         |

#### confirm mode (4 tests)

| #   | Test                                              | What it verifies                                                      |
| --- | ------------------------------------------------- | --------------------------------------------------------------------- |
| 4   | should add new members to the event               | `responses[]` and `invitedUserIds` updated, `responseSummary` correct |
| 5   | should not modify event when already in sync      | `added: []`, no writes necessary                                      |
| 6   | should not remove existing members from the event | Deactivated member remains in `responses[]` (historical preservation) |
| 7   | should handle youth member with guardians         | Youth gets `isYouthMember: true` + `guardianIds[]`, guardian invited  |

#### permissions (4 tests)

| #   | Test                                                 | What it verifies                  |
| --- | ---------------------------------------------------- | --------------------------------- |
| 8   | should reject unauthenticated request                | No auth → `unauthenticated`       |
| 9   | should reject request from regular player            | Player role → `permission-denied` |
| 10  | should allow club-admin who is not the event creator | Club admin can preview sync       |
| 11  | should allow group coach to sync                     | Coach can preview sync            |

#### validation (4 tests)

| #   | Test                                  | What it verifies                          |
| --- | ------------------------------------- | ----------------------------------------- |
| 12  | should reject missing required fields | Missing eventId/mode → `invalid-argument` |
| 13  | should reject invalid mode            | `mode: "invalid"` → `invalid-argument`    |
| 14  | should reject nonexistent event       | Invalid eventId → `not-found`             |
| 15  | should reject invalid scope value     | `scope: "all"` → `invalid-argument`       |

#### recurring events — future scope (2 tests)

| #   | Test                                                      | What it verifies                                        |
| --- | --------------------------------------------------------- | ------------------------------------------------------- |
| 16  | should sync multiple future occurrences when scope=future | New member added to all non-modified future occurrences |
| 17  | should sync only single occurrence when scope=single      | New member added only to targeted occurrence            |

#### creator exclusion (3 tests)

| #   | Test                                                                | What it verifies                                                           |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 18  | should NOT show the non-member creator as 'removed' in sync preview | Club-admin creator (not group member) excluded from `removed[]`            |
| 19  | non-member creator should be in invitedUserIds but NOT in responses | Creator in `invitedUserIds` for visibility, absent from `responses[]`      |
| 20  | group-member creator SHOULD still appear in responses normally      | Contrast: member-creator exists in both `invitedUserIds` and `responses[]` |

---

### 6. Auth & User Management (`auth.test.ts`) — 18 tests

#### createUserAccount (6 tests)

| #   | Test                                               | What it verifies                                       |
| --- | -------------------------------------------------- | ------------------------------------------------------ |
| 1   | should create a new user account                   | User doc created with displayName, email, legal fields |
| 2   | should reject duplicate user account creation      | Same UID → `already-exists`                            |
| 3   | should reject when UID doesn't match auth context  | Mismatched UID → `permission-denied`                   |
| 4   | should reject account creation with missing fields | Missing displayName → `invalid-argument`               |
| 5   | should reject unauthenticated account creation     | No auth → `unauthenticated`                            |
| 6   | should include legal acceptance fields             | `termsAcceptedAt` and `privacyAcceptedAt` persisted    |

#### getUserProfile (4 tests)

| #   | Test                                            | What it verifies                                  |
| --- | ----------------------------------------------- | ------------------------------------------------- |
| 7   | should return own profile                       | Returns displayName and email for requesting user |
| 8   | should reject cross-user profile access         | Different UID → `permission-denied`               |
| 9   | should return not-found for nonexistent profile | Invalid userId → `not-found`                      |
| 10  | should reject unauthenticated profile access    | No auth → `unauthenticated`                       |

#### updateUserProfile (6 tests)

| #   | Test                                                    | What it verifies                                       |
| --- | ------------------------------------------------------- | ------------------------------------------------------ |
| 11  | should update displayName                               | User doc reflects new displayName                      |
| 12  | should update multiple profile fields                   | Phone + gender updated simultaneously                  |
| 13  | should reject cross-user profile update                 | Different UID → `permission-denied`                    |
| 14  | should reject update with empty profileData             | Empty object → `invalid-argument` or error             |
| 15  | should reject update with missing userId                | Missing userId → `invalid-argument` or error           |
| 16  | should sync displayName update to allMembers collection | User doc updated; allMembers sync verified or accepted |

#### sendEmailVerification (2 tests)

| #   | Test                                  | What it verifies                                      |
| --- | ------------------------------------- | ----------------------------------------------------- |
| 17  | should send email verification        | Returns success (emulator intercepts email)           |
| 18  | should handle missing required fields | Missing email → `internal` (catch-all error wrapping) |

---

### 7. Invitation Flows (`invitations.test.ts`) — 21 tests

#### sendGroupInvitation (8 tests)

| #   | Test                                       | What it verifies                                                             |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| 1   | should send invitation to a new user       | Invitation doc created with token, status `pending`                          |
| 2   | should send invitation to an existing user | Existing auth user gets invitation                                           |
| 3   | should handle multiple email invitations   | Multiple emails → multiple invitation docs created                           |
| 4   | should reject empty email array            | Empty array → `internal` (catch-all wrapping)                                |
| 5   | should reject missing required fields      | Missing fields → `internal` (catch-all wrapping)                             |
| 6   | should reject unauthenticated invitation   | No auth → `internal` (catch-all wrapping)                                    |
| 7   | should supersede old pending invitation    | Re-invite same email+group+role → old becomes `superseded`, new is `pending` |
| 8   | should NOT supersede different-role invite | Same email+group, different role → both remain `pending`                     |

> **Note:** `sendGroupInvitation` has a catch-all error handler that wraps ALL errors (including validation `HttpsError`) as `internal`.
> **Note:** Test 7-8 verify the stale-invitation deduplication (Layer 1). A complementary client-side filter (Layer 2) in `fetchGroupInvites.ts` additionally skips invitations where `isExistingUser === false` to prevent stale pre-signup invitations from appearing as in-app notifications.

#### validateInvitationToken (4 tests)

| #   | Test                                       | What it verifies                                       |
| --- | ------------------------------------------ | ------------------------------------------------------ |
| 9   | should validate a fresh invitation token   | Returns valid invitation data with `pending` status    |
| 10  | should handle nonexistent token gracefully | Invalid token → soft error (not-found or empty result) |
| 11  | should detect already-used invitation      | Used invitation → appropriate status returned          |
| 12  | should reject missing token parameter      | Missing token → `invalid-argument`                     |

#### markInvitationUsed (3 tests)

| #   | Test                                  | What it verifies                                 |
| --- | ------------------------------------- | ------------------------------------------------ |
| 13  | should delete the invitation document | Doc removed from Firestore (returns `undefined`) |
| 14  | should reject missing required fields | Missing fields → `invalid-argument`              |
| 15  | should reject unauthenticated request | No auth → error                                  |

#### respondToEmailInvite (6 tests)

| #   | Test                                               | What it verifies                                             |
| --- | -------------------------------------------------- | ------------------------------------------------------------ |
| 16  | should reject an invitation                        | Status set to `rejected`                                     |
| 17  | should accept invitation for existing user         | Accept flow executes (resilient assertion for preconditions) |
| 18  | should create pending signup for non-existing user | Unauthenticated accept → pending signup flow triggered       |
| 19  | should reject when token is missing                | Missing token → `invalid-argument`                           |
| 20  | should reject invalid action                       | Invalid action string → `invalid-argument`                   |
| 21  | should handle not-found invitation token           | Nonexistent token → `not-found`                              |

> **Note:** `respondToGroupInvite` is NOT exported from `index.ts` (not a deployed function) — skipped in tests.

---

### 8. Pure Logic Unit Tests (`unit-pure-logic.test.ts`) — 82 tests

> These tests import pure functions directly with **zero Firebase dependency** and run in <1s.

#### validation.ts (24 tests)

| #     | Test Area                           | Count | What it verifies                                                    |
| ----- | ----------------------------------- | ----- | ------------------------------------------------------------------- |
| 1-4   | `validateRequiredFields`            | 4     | Missing single/multiple fields, all present, empty object           |
| 5-6   | `validateArrayField`                | 2     | Non-array rejected, valid array passes                              |
| 7-9   | `validateEmail`                     | 3     | Valid email, invalid format, empty string                           |
| 10-11 | `validateInvitationAction`          | 2     | Valid actions (`accept`/`reject`), invalid actions rejected         |
| 12-15 | `isInvitationExpired`               | 4     | Expired, not expired, exactly at boundary, null/missing `expiresAt` |
| 16-18 | `validateInvitationStatus`          | 3     | Valid pending status, already-accepted, null invitation data        |
| 19-21 | `validateShareableInvitationStatus` | 3     | Valid shareable, already-used, null data                            |
| 22-24 | `validateEmailMatch`                | 3     | Matching, non-matching, case-insensitive comparison                 |

#### roleValidation.ts (16 tests)

| #     | Test Area                    | Count | What it verifies                                                       |
| ----- | ---------------------------- | ----- | ---------------------------------------------------------------------- |
| 1-4   | `isValidGroupRole/ClubRole`  | 4     | Valid group roles, invalid roles, valid club roles, invalid club roles |
| 5-6   | `validateGroupRole/ClubRole` | 2     | Throws HttpsError for invalid roles                                    |
| 7-8   | `isYouthRole`                | 2     | Youth roles detected, adult roles rejected                             |
| 9-10  | `isGuardianRole`             | 2     | Guardian role detected, non-guardian rejected                          |
| 11-12 | `requiresSpecialHandling`    | 2     | Special roles (club-admin, head-coach), regular roles                  |
| 13-14 | `formatRoleName`             | 2     | Hyphenated role → display format, simple role capitalized              |
| 15-16 | `getRoleDescription`         | 2     | Known role → description string, unknown → fallback                    |

#### limits.ts (20 tests)

| #     | Test Area                  | Count | What it verifies                                        |
| ----- | -------------------------- | ----- | ------------------------------------------------------- |
| 1-3   | Tier constants             | 3     | FREE_TIER, PREMIUM_TIER, ENTERPRISE_TIER values correct |
| 4-6   | `checkResourceLimit`       | 3     | Under limit, at limit, over limit                       |
| 7-8   | `checkClubLimit`           | 2     | Free tier vs premium tier club limits                   |
| 9-10  | `checkGroupLimit`          | 2     | Free tier vs premium tier group limits                  |
| 11-12 | `checkClubMemberLimit`     | 2     | Free tier vs premium tier member limits                 |
| 13-14 | `getLimitsForTier`         | 2     | Free tier limits object, premium tier limits object     |
| 15-16 | `getClubSubscriptionTier`  | 2     | Active subscription → premium, no subscription → free   |
| 17-18 | `calculateUsagePercentage` | 2     | Normal calculation, zero limit returns 100%             |
| 19-20 | `shouldWarnAboutLimit`     | 2     | Above 80% → warn, below 80% → no warn                   |

#### lokValidation.ts (22 tests)

| #     | Test Area                 | Count | What it verifies                                                                                                                                                             |
| ----- | ------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-8   | `validateLokActivity`     | 8     | Age 7-25 eligible, under 7 ineligible, over 25 ineligible, missing personnummer, invalid personnummer, null activity, activity duration thresholds, boundary age (exactly 7) |
| 9-11  | `getReportingPeriod`      | 3     | Jan-Jun → period 1, Jul-Dec → period 2, boundary month (June)                                                                                                                |
| 12-14 | `getPeriodBounds`         | 3     | Period 1 bounds (Jan 1 – Jun 30), period 2 bounds (Jul 1 – Dec 31), year boundary                                                                                            |
| 15-18 | `validateLokReportPeriod` | 4     | Valid period, future period rejected, period 1 after Jun rejected, period 2 before Jul rejected                                                                              |
| 19-22 | `LOK_CONSTANTS`           | 4     | MIN_AGE = 6, MAX_AGE = 25, MIN_DURATION_MINUTES exists, MAX_ACTIVITIES_PER_DAY exists                                                                                        |
| 23-32 | Age boundary tests        | 10    | Age 6 eligible (MIN_AGE boundary), age 5 ineligible, age 25 eligible, age 26 ineligible                                                                                      |
| 33-42 | Leader deltagarstöd       | 10    | Leader aged 13–25 counts toward countedParticipants; leader aged 26+ does not; mixed scenarios                                                                               |
| 43-52 | `leaderBonus`             | 10    | ≥2 eligible leaders → leaderBonus=true; 1 leader → leaderBonus=false; 0 leaders → leaderBonus=false                                                                          |
| 53-62 | `estimateLokSubsidy`      | 10    | Correct deltagarstöd calc, leaderBonus included, 0 ledarstöd with no leaders, boundary counts                                                                                |
| 63-67 | `estimatePeriodSubsidy`   | 5     | Aggregates multiple activity results into combined period estimate                                                                                                           |

---

### 9. Permission Helpers (`permission-helpers.test.ts`) — 45 tests

> Pure synchronous tests for `utils/permissionHelpers.ts`. Zero Firebase dependency — runs instantly.
> Tests the entire permission layer that replaced async `permissionService` calls across all app screens.

#### isClubAdmin (6 tests)

| #   | Test                                             | What it verifies                                              |
| --- | ------------------------------------------------ | ------------------------------------------------------------- |
| 1   | should return false for null userProfile         | Null-safe: `null` profile → `false`                           |
| 2   | should return false for undefined userProfile    | Null-safe: `undefined` profile → `false`                      |
| 3   | should return false when user has no clubAccess  | Empty `clubAccess: []` → `false`                              |
| 4   | should return false for wrong clubId             | User is admin of club-A, querying club-B → `false`            |
| 5   | should return true for matching club-admin       | User has `role: "club-admin"` for the queried clubId → `true` |
| 6   | should return false for inactive club membership | `isActive: false` on clubAccess entry → `false`               |

#### canManageClub (2 tests)

| #   | Test                                        | What it verifies                             |
| --- | ------------------------------------------- | -------------------------------------------- |
| 7   | should delegate to isClubAdmin (true case)  | Club-admin profile → `true` (alias behavior) |
| 8   | should delegate to isClubAdmin (false case) | Regular member → `false` (alias behavior)    |

#### getUserClubRole (4 tests)

| #   | Test                                      | What it verifies                  |
| --- | ----------------------------------------- | --------------------------------- |
| 9   | should return null for null profile       | `null` → `null`                   |
| 10  | should return null for non-member         | User not in club → `null`         |
| 11  | should return "club-admin" for admin      | Admin membership → `"club-admin"` |
| 12  | should return "member" for regular member | Regular membership → `"member"`   |

#### getGroupRoles (5 tests)

| #   | Test                                           | What it verifies                                |
| --- | ---------------------------------------------- | ----------------------------------------------- |
| 13  | should return [] for null profile              | `null` → `[]`                                   |
| 14  | should return [] when no group access          | User in club but no `groupAccess` → `[]`        |
| 15  | should return [] for wrong groupId             | User in group-A, querying group-B → `[]`        |
| 16  | should return roles for matching group         | User with `["player", "coach"]` → array matches |
| 17  | should return [] for inactive group membership | `isActive: false` on groupAccess → `[]`         |

#### canManageGroup (6 tests)

| #   | Test                                       | What it verifies                              |
| --- | ------------------------------------------ | --------------------------------------------- |
| 18  | should return true for club-admin (bypass) | Club-admin can manage any group in their club |
| 19  | should return true for group admin         | Has `"admin"` role in group → `true`          |
| 20  | should return true for group coach         | Has `"coach"` role in group → `true`          |
| 21  | should return false for player             | Has `"player"` role only → `false`            |
| 22  | should return false for player-underage    | Has `"player-underage"` only → `false`        |
| 23  | should return false for null profile       | `null` → `false`                              |

#### isGroupMember (4 tests)

| #   | Test                                            | What it verifies                  |
| --- | ----------------------------------------------- | --------------------------------- |
| 24  | should return true when user has roles in group | Any role present → `true`         |
| 25  | should return false when not in group           | No matching groupAccess → `false` |
| 26  | should return false for null profile            | `null` → `false`                  |
| 27  | should return false for inactive group          | `isActive: false` → `false`       |

#### getHighestRole (8 tests)

| #   | Test                                          | What it verifies                         |
| --- | --------------------------------------------- | ---------------------------------------- |
| 28  | should return null for null profile           | `null` → `null`                          |
| 29  | should return null for non-member             | Not in club → `null`                     |
| 30  | should return "club-admin" for club-admin     | Club-level admin → `"club-admin"`        |
| 31  | should return "admin" for group admin         | Group admin (not club-admin) → `"admin"` |
| 32  | should return "coach" when highest is coach   | Coach without admin → `"coach"`          |
| 33  | should return "player" when highest is player | Player only → `"player"`                 |
| 34  | should return "player-underage" for youth     | Youth roles only → `"player-underage"`   |
| 35  | should return "member" when no group roles    | In club but no group access → `"member"` |

#### getActiveClubIds (4 tests)

| #   | Test                                       | What it verifies                              |
| --- | ------------------------------------------ | --------------------------------------------- |
| 36  | should return [] for null profile          | `null` → `[]`                                 |
| 37  | should return [] for empty clubAccess      | `clubAccess: []` → `[]`                       |
| 38  | should return active club IDs only         | Filters out `isActive: false` entries         |
| 39  | should return all club IDs when all active | Multiple clubs, all active → all IDs returned |

#### getActiveGroups (6 tests)

| #   | Test                                                 | What it verifies                                   |
| --- | ---------------------------------------------------- | -------------------------------------------------- |
| 40  | should return [] for null profile                    | `null` → `[]`                                      |
| 41  | should return [] for non-member of club              | Wrong clubId → `[]`                                |
| 42  | should return [] when no groupAccess                 | Club member with no groups → `[]`                  |
| 43  | should return active groups only                     | Filters out `isActive: false` groups               |
| 44  | should return all groups when all active             | Multiple groups → all returned with correct fields |
| 45  | should return objects with groupId, groupName, roles | Shape matches `{ groupId, groupName, roles }`      |

---

### 10. Flat Array Helpers (`flat-array-helpers.test.ts`) — 24 tests

> Pure synchronous tests for `src/utils/flatArrayHelpers.ts`. Zero Firebase dependency — runs instantly.
> Tests the builder that derives six flat role arrays from `clubAccess[]` for Firestore security rules.

#### buildFlatArraysFromClubAccess (20 tests)

| #   | Test                                          | What it verifies                                                   |
| --- | --------------------------------------------- | ------------------------------------------------------------------ |
| 1   | returns empty arrays for undefined input      | `undefined` → 6 empty arrays                                       |
| 2   | returns empty arrays for null input           | `null` → 6 empty arrays                                            |
| 3   | returns empty arrays for empty array input    | `[]` → 6 empty arrays                                              |
| 4   | returns empty arrays for non-array input      | `"string"` → 6 empty arrays                                        |
| 5   | detects club-admin role                       | `role: "club-admin"` → `adminOfClubs` contains clubId              |
| 6   | detects member role                           | `role: "member"` → `memberOfClubs` contains clubId                 |
| 7   | detects admin group role                      | Group roles `["admin"]` → `adminOfGroups` + `memberOfGroups`       |
| 8   | detects coach group role                      | Group roles `["coach"]` → `coachOfGroups` + `memberOfGroups`       |
| 9   | detects guardian group role                   | Group roles `["guardian"]` → `guardianOfGroups` + `memberOfGroups` |
| 10  | detects player role in memberOfGroups only    | `["player"]` → only `memberOfGroups` (not admin/coach/guardian)    |
| 11  | handles multiple roles in one group           | `["admin", "coach"]` → both arrays populated                       |
| 12  | skips inactive clubs                          | `isActive: false` → all arrays empty                               |
| 13  | skips inactive groups within active clubs     | Active club + inactive group → group excluded                      |
| 14  | treats missing isActive as active             | No `isActive` field → treated as active                            |
| 15  | handles multiple clubs and groups             | 2 clubs × N groups → correct union across all                      |
| 16  | handles club with no group access             | `groupAccess: []` → club-level arrays only                         |
| 17  | handles club with undefined groupAccess       | Missing `groupAccess` → no crash, club-level only                  |
| 18  | handles group with empty roles array          | `roles: []` → group not in `memberOfGroups`                        |
| 19  | handles group with undefined roles            | Missing `roles` → no crash                                         |
| 20  | correctly filters complex mixed-state profile | Active+inactive clubs/groups → only active entries included        |

#### flatArrayFieldsFromClubAccess (1 test)

| #   | Test                                                  | What it verifies               |
| --- | ----------------------------------------------------- | ------------------------------ |
| 21  | produces same result as buildFlatArraysFromClubAccess | Alias returns identical output |

#### emptyFlatArrays (2 tests)

| #   | Test                                                 | What it verifies                       |
| --- | ---------------------------------------------------- | -------------------------------------- |
| 22  | returns object with all six empty arrays             | Shape: 6 keys, all `[]`                |
| 23  | returns a new object each time (no shared reference) | Mutation safety: independent instances |

#### FlatRoleArrays type shape (1 test)

| #   | Test                                                | What it verifies              |
| --- | --------------------------------------------------- | ----------------------------- |
| 24  | buildFlatArraysFromClubAccess returns correct shape | Has all 6 expected properties |

---

### 11. Account Security (`account-security.test.ts`) — 30 tests

> Integration tests for email & password change features. Covers token revocation, email change request/verification, denormalised email synchronisation, and password reset request/verification.

#### revokeUserTokens (3 tests)

| #   | Test                                                | What it verifies                                              |
| --- | --------------------------------------------------- | ------------------------------------------------------------- |
| 1   | should revoke refresh tokens for authenticated user | `tokensValidAfterTime` advances after call                    |
| 2   | should reject unauthenticated requests              | No auth → `unauthenticated`                                   |
| 3   | should be idempotent                                | Calling twice succeeds; second `tokensValidAfterTime` ≥ first |

#### requestEmailChange (7 tests)

| #   | Test                                                  | What it verifies                                                 |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| 4   | should create email change request and return success | Token doc in `emailChangeRequests` with correct uid/email fields |
| 5   | should reject when new email is same as current       | Same email → `invalid-argument`                                  |
| 6   | should reject when new email is already taken         | Existing Auth user → `already-exists`                            |
| 7   | should reject invalid email format                    | Bad format → `invalid-argument`                                  |
| 8   | should reject unauthenticated requests                | No auth → `unauthenticated`                                      |
| 9   | should clean up previous pending requests             | Old token deleted, only new token remains                        |
| 10  | should reject empty email string                      | Empty string → `invalid-argument`                                |

#### verifyEmailChange (6 tests)

| #   | Test                                               | What it verifies                                                  |
| --- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 11  | should complete full email change flow             | Auth email updated, Firestore user doc updated, allMembers synced |
| 12  | should sync guardian email in youth user documents | `guardians[].guardianEmail` updated on youth user doc             |
| 13  | should reject expired token                        | Expired token → error redirect                                    |
| 14  | should reject already-verified token               | `verified: true` → error redirect                                 |
| 15  | should reject nonexistent token                    | Invalid token → error redirect                                    |
| 16  | should revoke refresh tokens after email change    | `tokensValidAfterTime` advances after verification                |

#### requestPasswordReset (6 tests)

| #   | Test                                                  | What it verifies                                              |
| --- | ----------------------------------------------------- | ------------------------------------------------------------- |
| 17  | should return success and create token for valid user | Token doc in `passwordResetRequests` with correct uid/email   |
| 18  | should return generic success for non-existent email  | No email enumeration — generic response, no token created     |
| 19  | should return generic success for unverified user     | Unverified users skipped — generic response, no token created |
| 20  | should reject invalid email format                    | Bad format → `invalid-argument`                               |
| 21  | should reject empty email                             | Empty string → `invalid-argument`                             |
| 22  | should rate limit after 3 requests per hour           | 4th request returns success but no new token created          |

#### resetPassword (8 tests)

| #   | Test                                                    | What it verifies                                                         |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| 23  | should serve reset form on GET with valid token         | HTML form served with password input                                     |
| 24  | should reset password and redirect on valid POST        | Password updated, token marked used, redirect to login                   |
| 25  | should reject expired token                             | Expired token → error page                                               |
| 26  | should reject already-used token                        | Used token → error page                                                  |
| 27  | should reject weak password on POST                     | < 6 chars → form redisplayed with error                                  |
| 28  | should reject nonexistent token                         | Invalid token → error page                                               |
| 29  | should reject when password confirmation does not match | Mismatched `newPassword`/`confirmPassword` → form redisplayed with error |
| 30  | should revoke refresh tokens after password reset       | `tokensValidAfterTime` advances after reset                              |

### 12. Youth Profile Admin (`update-youth-profile.test.ts`) — 11 tests

> Integration tests for admin editing of youth player profiles (name, DOB) and admin updating guardian phone numbers.

#### updateYouthProfile (9 tests)

| #   | Test                                            | What it verifies                                                   |
| --- | ----------------------------------------------- | ------------------------------------------------------------------ |
| 1   | club admin can update youth displayName         | `users/{youthUid}.displayName` updated                             |
| 2   | club admin can update youth dateOfBirth         | `users/{youthUid}.dateOfBirth` updated                             |
| 3   | club admin can update both name and DOB at once | Both fields updated in single call                                 |
| 4   | group admin can update youth profile            | Non-club-admin with group admin role succeeds                      |
| 5   | syncs guardian dependents after name update     | `dependents[].childName` and `.dateOfBirth` synced on guardian doc |
| 6   | rejects non-admin user                          | Guardian (no admin role) → `PERMISSION_DENIED`                     |
| 7   | rejects update on non-youth member              | Target without `isYouth: true` → `FAILED_PRECONDITION`             |
| 8   | rejects empty displayName                       | Whitespace-only name → `INVALID_ARGUMENT`                          |
| 9   | rejects when no update fields provided          | Neither displayName nor dateOfBirth → `INVALID_ARGUMENT`           |
| 10  | club admin can update without groupId           | Club admin succeeds without `groupId` (club-level access path)     |

#### Admin Guardian Phone Update (2 tests)

| #   | Test                                              | What it verifies                                         |
| --- | ------------------------------------------------- | -------------------------------------------------------- |
| 10  | club admin can update a guardian phone number     | `users/{guardianUid}.phoneNumber` updated via admin path |
| 11  | rejects non-admin updating another guardian phone | Non-admin caller → `PERMISSION_DENIED`                   |

### 13. Self-Leave Flows (`self-leave-flows.test.ts`) — 10 tests

> Tests the self-leave path in removeMemberFromGroup and fee cleanup on member removal.

#### Self-Leave (7 tests)

| #   | Test                                           | What it verifies                                                   |
| --- | ---------------------------------------------- | ------------------------------------------------------------------ |
| 1   | SL-1: player self-leave succeeds               | Player calls removeMemberFromGroup on themselves with roleToRemove |
| 2   | SL-2: coach self-leave succeeds                | Coach can self-remove from a group                                 |
| 3   | SL-3: group admin self-leave succeeds          | Group admin can self-remove                                        |
| 4   | SL-4: self-leave without roleToRemove rejected | Missing roleToRemove → `invalid-argument`                          |
| 5   | SL-5: player-underage cannot self-leave        | player-underage role → `permission-denied`                         |
| 6   | SL-6: self-leave with wrong role rejected      | Specifying a role the user doesn't have → `not-found`              |
| 7   | SL-7: unauthenticated self-leave rejected      | No auth token → `unauthenticated`                                  |

#### Fee Cleanup on Removal (3 tests)

| #   | Test                               | What it verifies                                   |
| --- | ---------------------------------- | -------------------------------------------------- |
| 8   | FC-1: fee cleanup on admin removal | includedMembers updated, totalExpected decremented |
| 9   | FC-2: fee cleanup on self-leave    | Self-leave also triggers fee cleanup               |
| 10  | FC-3: non-active fees not affected | Closed/cancelled fees left untouched               |

### 14. Remove Club Admin (`remove-club-admin.test.ts`) — 5 tests

> Tests the removeClubAdmin Cloud Function.

| #   | Test                                     | What it verifies                                                       |
| --- | ---------------------------------------- | ---------------------------------------------------------------------- |
| 1   | RCA-1: remove another club-admin         | Roles updated in allMembers, user doc marked inactive (no other roles) |
| 2   | RCA-2: sole club-admin cannot be removed | `failed-precondition` error when only one admin remains                |
| 3   | RCA-3: non-admin caller rejected         | Regular member → `permission-denied`                                   |
| 4   | RCA-4: unauthenticated rejected          | No auth token → `unauthenticated`                                      |
| 5   | RCA-5: target not a club-admin           | Returns `{ success: false }` gracefully                                |

### 15. Delete User Account (`delete-user-account.test.ts`) — 8 tests

> Tests the deleteUserAccount Cloud Function.

| #   | Test                                        | What it verifies                                        |
| --- | ------------------------------------------- | ------------------------------------------------------- |
| 1   | DUA-1: clean user deleted                   | User doc and auth deleted when no blockers              |
| 2   | DUA-2: notifications cleaned up             | Notifications subcollection deleted on account deletion |
| 3   | DUA-3: blocked by active groups             | Returns `reason: "has_groups"` with active group list   |
| 4   | DUA-4: blocked by club-admin role           | Returns `reason: "is_club_admin"` with club list        |
| 5   | DUA-5: blocked by active dependents         | Returns `reason: "has_dependents"` with dependent names |
| 6   | DUA-6: inactive club access allows deletion | Inactive clubAccess doesn't block deletion              |
| 7   | DUA-7: unauthenticated rejected             | No auth token → `unauthenticated`                       |
| 8   | DUA-8: inactive dependents allow deletion   | Dependents with only inactive club access don't block   |

---

## Coverage Gap Analysis

### Backend Cloud Functions — Current Coverage

| Domain            | Functions | Tested                                                                                                                                                                                                                                   | Coverage |
| ----------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Clubs**         | 9         | 4 (`createClub`, `getClub`, `updateClub`, `deleteClub`)                                                                                                                                                                                  | 44%      |
| **Groups**        | 14        | 7 (`createGroup`, `getGroup`, `updateGroup`, `deleteGroup`, `createSubGroup`, `updateSubGroup`, `deleteSubGroup`)                                                                                                                        | 50%      |
| **Members**       | 16        | 10 (`addMemberToClub`, `addMemberToGroup`, `removeMemberFromClub`, `removeMemberFromGroup` (self-leave + fee cleanup), `removeClubAdmin`, `updateMemberRole`, `updateClubMemberRole`, `addMemberToSubGroup`, `removeMemberFromSubGroup`) | 63%      |
| **Payments**      | 3         | 2 (`createMembershipFee`, `getMembershipFees`)                                                                                                                                                                                           | 67%      |
| **Auth**          | 10        | 7 (`createUserAccount`, `getUserProfile`, `updateUserProfile`, `sendEmailVerification`, `revokeUserTokens`, `requestEmailChange`, `verifyEmailChange`)                                                                                   | 70%      |
| **Events**        | 13        | 10 (`createEventV2`, `getEvent`, `updateEvent`, `deleteEvent`, `updateEventResponse`, `recordAttendance`, `getStatistics`, `cancelEvent`, `createRecurringEvent`, `editRecurringEvent`) — 46 automated integration tests                 | 77%      |
| **Invitations**   | 6         | 4 (`sendGroupInvitation`, `validateInvitationToken`, `markInvitationUsed`, `respondToEmailInvite`)                                                                                                                                       | 67%      |
| **Users**         | 5         | 1 (`deleteUserAccount`)                                                                                                                                                                                                                  | 20%      |
| **Notifications** | 1         | 0                                                                                                                                                                                                                                        | 0%       |
| **Stripe**        | 6         | 0                                                                                                                                                                                                                                        | 0% ★     |
| **Subscriptions** | 5         | 0                                                                                                                                                                                                                                        | 0% ★     |
| **News**          | 1         | 0                                                                                                                                                                                                                                        | 0%       |
| **Legal**         | 2         | 0                                                                                                                                                                                                                                        | 0%       |
| **LOK/RF**        | 12        | 9 (`storePersonnummer`, `removePersonnummer`, `getPersonnummerStatus`, `updateClubRfSettings`, `generateLokReport`, `listLokReports`, `getLokReport`, `deleteLokReport`, `resolveReportConflict`)                                        | 75%      |
| **Profile**       | 2         | 0                                                                                                                                                                                                                                        | 0%       |
| **Scheduled**     | 2         | 0                                                                                                                                                                                                                                        | 0%       |
| **TOTAL**         | **~104**  | **51**                                                                                                                                                                                                                                   | **~49%** |

★ Stripe/Subscription functions require external Stripe API — need mocking strategy

### Pure Logic Utility Coverage

| Module                 | Functions Tested | Coverage |
| ---------------------- | ---------------- | -------- |
| `validation.ts`        | 8 / 8            | 100%     |
| `roleValidation.ts`    | 8 / 8            | 100%     |
| `limits.ts`            | 8 / 8            | 100%     |
| `lokValidation.ts`     | 9 / 9            | 100%     |
| `permissionHelpers.ts` | 9 / 9            | 100%     |
| `flatArrayHelpers.ts`  | 3 / 3            | 100%     |

### What's NOT Tested

1. ~~**Auth flow** — user creation, email verification, profile retrieval~~ ✅ Covered
2. ~~**Events** — create, update, delete, RSVP, attendance, statistics~~ ✅ Covered
3. ~~**Invitation system** — send, respond, validate token, process post-signup~~ ✅ Covered
4. ~~**LOK/RF integration** — LOK reports, RF API calls (Cloud Functions)~~ ✅ Covered (9/12 functions tested; `submitLokReportToRf`, `checkRfApiStatus`, `generateKommunExport` still pending due to external RF API dependency)
5. **Legal compliance** — config fetch, acceptance recording
6. **News** — creation with notifications
7. **User doc management** — club info updates, group info updates, inactivity marking
8. **Cascade operations** — club deletion updating all member user docs
9. **Frontend permission logic** — ✅ `permissionHelpers.ts` fully covered (45 tests). Context providers (UserContext, ClubDataContext, GroupDataContext) are integration/runtime code tied to Firestore listeners — not unit-testable without full emulator or mock setup.
10. ~~**Pure logic utilities** — LOK validation, role validation, limits, personnummer format~~ ✅ Covered

---

## Level 1 — Backend E2E Integration Test Plan

> **What is Level 1 testing?**
> We call the real Cloud Functions against the Firebase Emulator in the same sequence
> the app's orchestration service (`processInvitationAfterUserResponse`) would call them.
> After each flow completes, we read Firestore documents and assert that every field was
> correctly written/updated.
>
> This catches **all backend logic bugs** (the same class of bugs we've been fixing)
> without needing any UI automation.

### Shared Test Setup (beforeAll)

Every suite starts from `clearAll()` and creates:

- `adminUser` — club admin who creates clubs/groups (role: `club-admin`)
- `testClub` — a club created by adminUser
- `testGroup` — a group inside testClub ("Group A")

Additional users/groups are created per test case as needed.

---

### Suite A: Add Member — New Users (No Clubnizer Account)

**File:** `functions/test/invitation-add-new-users.test.ts`

> **Flow replayed per test:**
> `sendGroupInvitation` → `createFullTestUser` (simulates signup) → `addMemberToClub`
> → `updateUserClubInfo` → `addMemberToGroup` → `updateUserGroupInfo` → `markInvitationUsed`

#### TC-A1: New Player (adult)

| Step | Action                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | Call `sendGroupInvitation` with `role: "player"`, `emails: ["newplayer@test.com"]`                |
| 2    | Create new user via `createFullTestUser({ email: "newplayer@test.com" })`                         |
| 3    | Call `addMemberToClub` with `memberData: { userId, roles: ["player"], name, email }`              |
| 4    | Call `updateUserClubInfo` with `{ uid, clubInfo, role: "player" }`                                |
| 5    | Call `addMemberToGroup` with `memberData: { userId, roles: ["player"], name, email }`             |
| 6    | Call `updateUserGroupInfo` with `{ uid, clubId, groupInfo, roles: ["player"], operation: "add" }` |
| 7    | Call `markInvitationUsed` with `{ invitationToken, userId, status: "accepted" }`                  |

| ✅ Document Checked                                  | Field(s) Asserted                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `invitations/{token}` (after step 1)                 | `status === "pending"`, `role === "player"`, `email` matches, `clubId` matches |
| `clubs/{clubId}/allMembers/members`                  | `members[]` contains `{ userId, roles: ["player"], name, isActive: true }`     |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | `members[]` contains `{ userId, roles: ["player"], name, isActive: true }`     |
| `users/{newUserUid}`                                 | `clubAccess[]` contains `{ clubId, role: "member" }`                           |
| `users/{newUserUid}`                                 | `clubAccess[0].groupAccess[]` contains `{ groupId, roles: ["player"] }`        |
| `invitations/{token}` (after step 7)                 | Document does NOT exist (deleted by `markInvitationUsed`)                      |

#### TC-A2: New Coach

Same flow as TC-A1 with `role: "coach"`.

| ✅ Document Checked                                  | Field(s) Asserted                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `clubs/{clubId}/allMembers/members`                  | member entry has `roles: ["coach"]`                                     |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | member entry has `roles: ["coach"]`                                     |
| `users/{uid}`                                        | `clubAccess[0].role === "member"`, `groupAccess[0].roles === ["coach"]` |

#### TC-A3: New Admin (group admin)

Same flow as TC-A1 with `role: "admin"`.

| ✅ Document Checked                                  | Field(s) Asserted                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `clubs/{clubId}/allMembers/members`                  | member entry has `roles: ["admin"]`                                     |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | member entry has `roles: ["admin"]`                                     |
| `users/{uid}`                                        | `clubAccess[0].role === "member"`, `groupAccess[0].roles === ["admin"]` |

#### TC-A4: New Club Admin

> Club admin flow has NO group operations — club level only.

| Step | Action                                                                               |
| ---- | ------------------------------------------------------------------------------------ |
| 1    | Call `sendGroupInvitation` with `role: "club-admin"`, `invitationType: "club_admin"` |
| 2    | Create new user via `createFullTestUser`                                             |
| 3    | Call `addMemberToClub` with `memberData: { userId, roles: ["club-admin"] }`          |
| 4    | Call `updateUserClubInfo` with `{ uid, clubInfo, role: "club-admin" }`               |
| 5    | Call `markInvitationUsed`                                                            |

| ✅ Document Checked                                  | Field(s) Asserted                                 |
| ---------------------------------------------------- | ------------------------------------------------- |
| `clubs/{clubId}/allMembers/members`                  | member entry has `roles: ["club-admin"]`          |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Does NOT contain the club-admin user              |
| `users/{uid}`                                        | `clubAccess[0].role === "club-admin"`             |
| `users/{uid}`                                        | `clubAccess[0].groupAccess` is empty or undefined |

#### TC-A5: New Youth (player-underage) — with guardian

> Youth flow has additional steps: create youth doc, add guardian to club.

| Step | Action                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | Create guardian user via `createFullTestUser({ email: "parent@test.com" })`                                                |
| 2    | Call `sendGroupInvitation` with `role: "player-underage"`, `invitationType: "youth_member"`, `youthData`                   |
| 3    | Call `createYouthMemberDocument` with `{ childName, dateOfBirth, guardianUid, guardianEmail, guardianName, relationship }` |
| 4    | Call `addMemberToClub` for youth with `memberData: { userId: youthUid, roles: ["player-underage"], guardiansContacts }`    |
| 5    | Call `addMemberToClub` for guardian with `memberData: { userId: guardianUid, roles: ["guardian"] }`                        |
| 6    | Call `updateUserClubInfo` for guardian with `role: "guardian"`                                                             |
| 7    | Call `updateUserClubInfo` for youth with `role: "player-underage"`                                                         |
| 8    | Call `addMemberToGroup` for youth                                                                                          |
| 9    | Call `updateUserGroupInfo` for youth with `roles: ["player-underage"]`                                                     |
| 10   | Call `updateGuardianDependentAccess` with `{ youthUid, guardianUid }`                                                      |
| 11   | Call `markInvitationUsed`                                                                                                  |

| ✅ Document Checked                                  | Field(s) Asserted                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `users/{youthUid}`                                   | `isYouth === true`, `guardians[]` contains guardian info, `clubAccess[]` has club entry               |
| `users/{youthUid}`                                   | `clubAccess[0].role === "member"`, `groupAccess[]` contains `{ groupId, roles: ["player-underage"] }` |
| `users/{guardianUid}`                                | `dependents[]` contains `{ uid: youthUid, childName, dateOfBirth }`                                   |
| `users/{guardianUid}`                                | `clubAccess[]` contains `{ clubId, role: "member" }` (NOT "guardian" — role is permission-level)      |
| `clubs/{clubId}/allMembers/members`                  | Contains BOTH youth (`roles: ["player-underage"]`) AND guardian (`roles: ["guardian"]`)               |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Contains youth with `roles: ["player-underage"]`                                                      |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Does NOT contain guardian (guardians are club-level only)                                             |

#### TC-A6: New Youth — deduplication check

> If guardian already has a dependent with the same name + DOB, return existing youth UID.

| Step | Action                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------- |
| 1    | Call `createYouthMemberDocument` with `{ childName: "Anna", dateOfBirth: "2012-03-15", guardianUid }` |
| 2    | Call `createYouthMemberDocument` again with identical `childName` + `dateOfBirth` + `guardianUid`     |

| ✅ Assertion                                                                           |
| -------------------------------------------------------------------------------------- |
| Both calls return the SAME `youthUid`                                                  |
| `users/{guardianUid}` → `dependents[]` has exactly ONE entry for "Anna" / "2012-03-15" |

---

### Suite B: Add Member — Existing Users (Has Clubnizer Account)

**File:** `functions/test/invitation-add-existing-users.test.ts`

> **Flow replayed per test:**
> `sendGroupInvitation` → `checkMembership` → conditional `addMemberToClub`/`updateUserClubInfo`
> → conditional `addMemberToGroup`/`updateUserGroupInfo` → `markInvitationUsed`

#### TC-B1: Existing Player (not in club)

| Precondition | User exists in system but is NOT in testClub |
| ------------ | -------------------------------------------- |

| Step | Action                                                                                     |
| ---- | ------------------------------------------------------------------------------------------ |
| 1    | Call `sendGroupInvitation` for existing user's email, `role: "player"`                     |
| 2    | Call `checkMembership` with `{ userId, clubId, groupId }`                                  |
| 3    | Assert: `isClubMember === false`, `isGroupMember === false`                                |
| 4    | Call `addMemberToClub` → `updateUserClubInfo` → `addMemberToGroup` → `updateUserGroupInfo` |
| 5    | Call `markInvitationUsed`                                                                  |

| ✅ Document Checked                                  | Field(s) Asserted                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `clubs/{clubId}/allMembers/members`                  | Contains member with `roles: ["player"]`                                                                  |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Contains member with `roles: ["player"]`                                                                  |
| `users/{uid}`                                        | `clubAccess[]` has `{ clubId, role: "member" }`, `groupAccess[]` has group entry with `roles: ["player"]` |

#### TC-B2: Existing Coach (not in club)

Same as TC-B1 with `role: "coach"`. Same assertions with `["coach"]`. `clubAccess[0].role === "member"`.

#### TC-B3: Existing Admin (not in club)

Same as TC-B1 with `role: "admin"`. Same assertions with `["admin"]`. `clubAccess[0].role === "member"`.

#### TC-B4: Existing Club Admin (not in club)

| Step | Action                                                                               |
| ---- | ------------------------------------------------------------------------------------ |
| 1    | Call `sendGroupInvitation` with `role: "club-admin"`, `invitationType: "club_admin"` |
| 2    | Call `checkMembership` → assert `isClubMember === false`                             |
| 3    | Call `addMemberToClub` with `roles: ["club-admin"]`                                  |
| 4    | Call `updateUserClubInfo` with `role: "club-admin"`                                  |
| 5    | Call `markInvitationUsed`                                                            |

| ✅ Document Checked                 | Field(s) Asserted                                                  |
| ----------------------------------- | ------------------------------------------------------------------ |
| `clubs/{clubId}/allMembers/members` | Contains `{ userId, roles: ["club-admin"] }`                       |
| `users/{uid}`                       | `clubAccess[]` contains `{ clubId, role: "club-admin" }`           |
| `users/{uid}`                       | `clubAccess[0].groupAccess` is empty (no group ops for club-admin) |

#### TC-B5: Existing user — already in club, adding to NEW group

| Precondition | User is already a club member (player in Group A) |
| ------------ | ------------------------------------------------- |

| Step | Action                                                                      |
| ---- | --------------------------------------------------------------------------- |
| 1    | Create a second group ("Group B")                                           |
| 2    | Call `sendGroupInvitation` for Group B, `role: "player"`                    |
| 3    | Call `checkMembership` → `isClubMember === true`, `isGroupMember === false` |
| 4    | Skip `addMemberToClub` (already in club)                                    |
| 5    | Call `addMemberToGroup` for Group B                                         |
| 6    | Call `updateUserGroupInfo` with `updateClubMemberListRoles: true`           |
| 7    | Call `markInvitationUsed`                                                   |

| ✅ Document Checked                                   | Field(s) Asserted                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `clubs/{clubId}/allMembers/members`                   | Member entry unchanged, `roles` still contains `"player"`           |
| `clubs/{clubId}/groups/{groupBId}/allMembers/members` | Contains `{ userId, roles: ["player"] }`                            |
| `users/{uid}`                                         | `clubAccess[0].groupAccess[]` has TWO entries (Group A and Group B) |

#### TC-B6: Existing user — already in group with different role (role accumulation)

| Precondition | User is a player in Group A |
| ------------ | --------------------------- |

| Step | Action                                                                        |
| ---- | ----------------------------------------------------------------------------- |
| 1    | Call `sendGroupInvitation` for same group, `role: "coach"`                    |
| 2    | Call `checkMembership` → `isGroupMember === true`, `currentRoles: ["player"]` |
| 3    | Call `updateMemberRole` with `{ operation: "add", roleToAdd: "coach" }`       |
| 4    | Call `markInvitationUsed`                                                     |

| ✅ Document Checked                                  | Field(s) Asserted                                             |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Member has `roles: ["player", "coach"]` (accumulated)         |
| `clubs/{clubId}/allMembers/members`                  | Member `roles` contains both `"player"` and `"coach"`         |
| `users/{uid}`                                        | `groupAccess[0].roles` contains both `"player"` and `"coach"` |

#### TC-B7: Existing Club Admin — already in club (role accumulation)

| Precondition | User is already a player in the club |
| ------------ | ------------------------------------ |

| Step | Action                                                                               |
| ---- | ------------------------------------------------------------------------------------ |
| 1    | Call `sendGroupInvitation` with `role: "club-admin"`, `invitationType: "club_admin"` |
| 2    | Call `checkMembership` → `isClubMember === true`                                     |
| 3    | Call `updateClubMemberRole` with `{ operation: "add", roleToAdd: "club-admin" }`     |
| 4    | Call `updateUserClubInfo` with `role: "club-admin"`                                  |
| 5    | Call `markInvitationUsed`                                                            |

| ✅ Document Checked                 | Field(s) Asserted                                          |
| ----------------------------------- | ---------------------------------------------------------- |
| `clubs/{clubId}/allMembers/members` | Member `roles` contains BOTH `"player"` AND `"club-admin"` |
| `users/{uid}`                       | `clubAccess[0].role === "club-admin"` (upgraded)           |

#### TC-B8: Existing Youth — adding to new group

| Precondition | Youth already exists in club (from TC-A5), adding to Group B |
| ------------ | ------------------------------------------------------------ |

| Step | Action                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| 1    | Create Group B                                                                                               |
| 2    | Call `sendGroupInvitation` with `invitationType: "youth_member_existing"`, `existingYouthData: { youthUid }` |
| 3    | Call `checkMembership` for youth → `isClubMember === true`, `isGroupMember === false`                        |
| 4    | Call `updateClubMemberRole` for youth → add `"player-underage"` (accumulation)                               |
| 5    | Call `addMemberToGroup` for youth in Group B                                                                 |
| 6    | Call `updateUserGroupInfo` for youth                                                                         |
| 7    | Call `updateGuardianDependentAccess`                                                                         |
| 8    | Call `markInvitationUsed`                                                                                    |

| ✅ Document Checked                                   | Field(s) Asserted                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `clubs/{clubId}/groups/{groupBId}/allMembers/members` | Contains youth with `roles: ["player-underage"]`                                            |
| `users/{youthUid}`                                    | `clubAccess[0].role === "member"`, `groupAccess[]` has entries for BOTH Group A and Group B |
| `users/{guardianUid}`                                 | `dependents[].clubAccess` updated (via `updateGuardianDependentAccess`)                     |

---

### Suite C: Remove Member

**File:** `functions/test/remove-member-flows.test.ts`

> **Flow replayed per test:**
> `removeMemberFromGroup` → `updateUserGroupInfo(operation: "remove")`
> → (if last group) `removeMemberFromClub` → `updateUserClubRemoval`

#### TC-C1: Remove player from group (still in other groups)

| Precondition | Player is in Group A AND Group B of the same club |
| ------------ | ------------------------------------------------- |

| Step | Action                                                                                    |
| ---- | ----------------------------------------------------------------------------------------- |
| 1    | Call `removeMemberFromGroup` with `{ clubId, groupId: groupAId, userId }`                 |
| 2    | Call `updateUserGroupInfo` with `{ uid, clubId, groupInfo: groupA, operation: "remove" }` |

| ✅ Document Checked                                   | Field(s) Asserted                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `clubs/{clubId}/groups/{groupAId}/allMembers/members` | Does NOT contain user                                            |
| `clubs/{clubId}/groups/{groupBId}/allMembers/members` | Still contains user (untouched)                                  |
| `clubs/{clubId}/allMembers/members`                   | Still contains user (still in club via Group B)                  |
| `users/{uid}`                                         | `clubAccess[0].groupAccess[]` has Group B only (Group A removed) |

#### TC-C2: Remove player from group (last group → also remove from club)

| Precondition | Player is in Group A only |
| ------------ | ------------------------- |

| Step | Action                                                          |
| ---- | --------------------------------------------------------------- |
| 1    | Call `removeMemberFromGroup` with `{ clubId, groupId, userId }` |
| 2    | Call `updateUserGroupInfo` with `operation: "remove"`           |
| 3    | Call `removeMemberFromClub` with `{ clubId, userId }`           |
| 4    | Call `updateUserClubRemoval` with `{ uid, clubId }`             |

| ✅ Document Checked                                  | Field(s) Asserted                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Does NOT contain user                                                    |
| `clubs/{clubId}/allMembers/members`                  | Does NOT contain user                                                    |
| `users/{uid}`                                        | `clubAccess[]` does NOT contain active club entry (or `isActive: false`) |

#### TC-C3: Remove coach from group

Same as TC-C2 with `role: "coach"`. Same assertions.

#### TC-C4: Remove admin from group

Same as TC-C2 with `role: "admin"`. Same assertions.

#### TC-C5: Remove player-underage (youth) from group + club

| Precondition | Youth in Group A with guardian in club |
| ------------ | -------------------------------------- |

| Step | Action                                                                             |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | Call `removeMemberFromGroup` with `{ clubId, groupId, userId: youthUid }`          |
| 2    | Call `updateUserGroupInfo` for youth with `operation: "remove"`                    |
| 3    | Call `removeMemberFromClub` for youth                                              |
| 4    | Call `updateUserClubRemoval` for youth                                             |
| 5    | Call `updateGuardianDependentClubRemoval` with `{ youthUid, guardianUid, clubId }` |
| 6    | Call `checkAndMarkGuardianInactive` with `{ guardianUid, clubId }`                 |

| ✅ Document Checked                                  | Field(s) Asserted                                         |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Does NOT contain youth                                    |
| `clubs/{clubId}/allMembers/members`                  | Does NOT contain youth                                    |
| `users/{youthUid}`                                   | `clubAccess[]` does NOT have active club entry            |
| `users/{guardianUid}`                                | `dependents[]` updated (youth's club removed)             |
| `clubs/{clubId}/allMembers/members`                  | Guardian marked inactive (if no other dependents in club) |

#### TC-C6: Remove one role from multi-role member (de-accumulation)

| Precondition | User is both player AND coach in Group A |
| ------------ | ---------------------------------------- |

| Step | Action                                                                                 |
| ---- | -------------------------------------------------------------------------------------- |
| 1    | Call `removeMemberFromGroup` with `{ clubId, groupId, userId, roleToRemove: "coach" }` |

| ✅ Document Checked                                  | Field(s) Asserted                                            |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Member still exists with `roles: ["player"]` (coach removed) |
| `clubs/{clubId}/allMembers/members`                  | `roles` contains `"player"`, does NOT contain `"coach"`      |
| `users/{uid}`                                        | `groupAccess[0].roles === ["player"]`                        |

#### TC-C7: Remove club-admin role

| Precondition | User has `roles: ["player", "club-admin"]` in club |
| ------------ | -------------------------------------------------- |

| Step | Action                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 1    | Call `updateClubMemberRole` with `{ clubId, userId, operation: "remove", roleToRemove: "club-admin" }` |

| ✅ Document Checked                 | Field(s) Asserted                                   |
| ----------------------------------- | --------------------------------------------------- |
| `clubs/{clubId}/allMembers/members` | Member `roles` contains `"player"` only             |
| `users/{uid}`                       | `clubAccess[0].role` downgraded from `"club-admin"` |

---

### Suite D: Subgroup Member Operations

**File:** `functions/test/subgroup-member-flows.test.ts`

#### TC-D1: Add member to subgroup

| Precondition | Member is in the parent group |
| ------------ | ----------------------------- |

| Step | Action                                                                    |
| ---- | ------------------------------------------------------------------------- |
| 1    | Call `addMemberToSubGroup` with `{ clubId, groupId, subGroupId, userId }` |

| ✅ Document Checked                             | Field(s) Asserted                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `.../subgroups/{subgroupId}/allMembers/members` | Contains member with correct `userId`, `name`, `roles` (copied from group) |

#### TC-D2: Remove member from subgroup

| Step | Action                                                                         |
| ---- | ------------------------------------------------------------------------------ |
| 1    | Call `removeMemberFromSubGroup` with `{ clubId, groupId, subGroupId, userId }` |

| ✅ Document Checked                             | Field(s) Asserted                                   |
| ----------------------------------------------- | --------------------------------------------------- |
| `.../subgroups/{subgroupId}/allMembers/members` | Does NOT contain member                             |
| `.../groups/{groupId}/allMembers/members`       | Still contains member (group membership unaffected) |

#### TC-D3: Add member to subgroup — not in parent group → error

| Precondition | User is NOT in the parent group |
| ------------ | ------------------------------- |

| ✅ Assertion                                                            |
| ----------------------------------------------------------------------- |
| Function throws error (cannot add to subgroup without group membership) |

---

### Suite E: Club / Group / Subgroup CRUD

**File:** `functions/test/crud-lifecycle.test.ts`

> These extend the existing suite tests with deeper field-level assertions.

#### TC-E1: Create club — verify all fields

| ✅ Document Checked                 | Field(s) Asserted                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `clubs/{clubId}`                    | `name`, `description`, `location`, `isActive === true`, `createdBy`, `activeGroupCount === 0` |
| `clubs/{clubId}/allMembers/members` | `members === []`, `memberCount === 0`                                                         |
| `users/{adminUid}`                  | `activeClubsAsAdmin` incremented by 1                                                         |

#### TC-E2: Create club — missing name → `invalid-argument`

#### TC-E3: Delete club — cascades to groups + subgroups

| ✅ Document Checked | Field(s) Asserted                                                     |
| ------------------- | --------------------------------------------------------------------- |
| `clubs/{clubId}`    | `isActive === false`, `deletionScheduledAt` ~30 days out, `deletedBy` |
| `users/{adminUid}`  | `activeClubsAsAdmin` decremented                                      |
| All groups          | `isActive === false` (cascade)                                        |
| All subgroups       | `isActive === false` (cascade)                                        |

#### TC-E4: Delete club — non-admin → `permission-denied`

#### TC-E5: Create group — verify all fields

| ✅ Document Checked               | Field(s) Asserted                              |
| --------------------------------- | ---------------------------------------------- |
| `clubs/{clubId}/groups/{groupId}` | `name`, `sport`, `clubId`, `isActive === true` |
| `.../allMembers/members`          | `members === []`, `memberCount === 0`          |
| `clubs/{clubId}`                  | `activeGroupCount` incremented                 |

#### TC-E6: Delete group — cascades to subgroups

| ✅ Document Checked               | Field(s) Asserted                               |
| --------------------------------- | ----------------------------------------------- |
| `clubs/{clubId}/groups/{groupId}` | `isActive === false`, `deletionScheduledAt` set |
| `clubs/{clubId}`                  | `activeGroupCount` decremented                  |
| All subgroups                     | `isActive === false` (cascade)                  |

#### TC-E7: Delete group — non-admin → `permission-denied`

#### TC-E8: Create subgroup

| ✅ Document Checked               | Field(s) Asserted                              |
| --------------------------------- | ---------------------------------------------- |
| `.../subgroups/{subgroupId}`      | `name`, `isActive === true`, `groupId` matches |
| `clubs/{clubId}/groups/{groupId}` | `subGroups[]` contains new subgroupId          |

#### TC-E9: Edit subgroup name

| ✅ Document Checked          | Field(s) Asserted           |
| ---------------------------- | --------------------------- |
| `.../subgroups/{subgroupId}` | `name` updated to new value |

#### TC-E10: Delete subgroup (soft delete)

| ✅ Document Checked          | Field(s) Asserted    |
| ---------------------------- | -------------------- |
| `.../subgroups/{subgroupId}` | `isActive === false` |

#### TC-E11: Edit group name and description

| ✅ Document Checked               | Field(s) Asserted                |
| --------------------------------- | -------------------------------- |
| `clubs/{clubId}/groups/{groupId}` | `name` and `description` updated |

#### TC-E12: Edit group — non-admin → `permission-denied`

---

### Suite G: Guardian Management

**File:** `functions/test/guardian-flows.test.ts`

> Tests addGuardianToYouth and removeGuardianFromYouth Cloud Functions.

#### TC-G1: Add guardian to youth (guardian NOT in club)

| Step | Action                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------- |
| 1    | Setup club + group + admin                                                                     |
| 2    | Create guardian user and youth member via `createYouthMemberDocument`                          |
| 3    | Create second guardian (not yet in club)                                                       |
| 4    | Call `addGuardianToYouth` with `{ clubId, groupId, youthUid, guardianUid, guardianName, ... }` |

| ✅ Document Checked                                  | Field(s) Asserted                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `users/{youthUid}`                                   | `guardians` array has 2 entries, includes guardian2 with correct relationship |
| `clubs/{clubId}/allMembers/members`                  | Youth member `guardiansContacts` includes guardian2                           |
| `clubs/{clubId}/groups/{groupId}/allMembers/members` | Youth group member `guardiansContacts` includes guardian2                     |
| `users/{guardian2Uid}`                               | `dependents` includes youth                                                   |
| `clubs/{clubId}/allMembers/members`                  | Guardian2 has club membership with `roles: ["guardian"]`                      |
| `users/{guardian2Uid}`                               | `clubAccess` includes entry with `clubId` and `role: "member"`                |

#### TC-G2: Add guardian who is already in club (role accumulation)

| ✅ Assertion                    | Expected                                  |
| ------------------------------- | ----------------------------------------- |
| Guardian2's club member `roles` | Contains both `"player"` and `"guardian"` |

#### TC-G3: Prevent duplicate guardian → `already-exists`

#### TC-G4: Remove guardian from youth (basic)

| ✅ Document Checked   | Field(s) Asserted                                       |
| --------------------- | ------------------------------------------------------- |
| `users/{youthUid}`    | `guardians` no longer contains removed guardian         |
| `users/{guardianUid}` | `dependents` no longer contains youth                   |
| Club AllMembers       | Youth's `guardiansContacts` no longer contains guardian |
| Group AllMembers      | Youth's `guardiansContacts` no longer contains guardian |

#### TC-G5: Remove guardian (only role) → mark inactive

| ✅ Assertion             | Expected                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `guardianMarkedInactive` | `true`                                                                                 |
| Guardian club member     | `isActive === false`                                                                   |
| Guardian `clubAccess`    | Entry exists with `isActive === false`, `inactiveSince` and `scheduledForDeletion` set |

#### TC-G6: Remove guardian role, keep player role

| ✅ Assertion                    | Expected                                           |
| ------------------------------- | -------------------------------------------------- |
| `guardianMarkedInactive`        | `false`                                            |
| Guardian club member `roles`    | Contains `"player"`, does NOT contain `"guardian"` |
| Guardian club member `isActive` | Not false (still active)                           |

#### TC-G7: addGuardianToYouth — missing fields → `invalid-argument`

#### TC-G8: addGuardianToYouth — youth not found → `not-found`

#### TC-G9: removeGuardianFromYouth — missing fields → `invalid-argument`

#### TC-G10: Full add-then-remove roundtrip

| ✅ Assertion | Expected                                           |
| ------------ | -------------------------------------------------- |
| After add    | Youth has 2 guardians                              |
| After remove | Youth has 1 guardian (original), guardian2 removed |

#### TC-G11: Add guardian — subgroup guardiansContacts cascade

> Youth is in a subgroup. When a guardian is added, subgroup allMembers must also be updated.

| Step | Action                                                                                |
| ---- | ------------------------------------------------------------------------------------- |
| 1    | Setup club + group, create youth + guardian, add youth to club and group              |
| 2    | Create subgroup via `createSubGroup`, add youth to subgroup via `addMemberToSubGroup` |
| 3    | Create second guardian, call `addGuardianToYouth`                                     |

| ✅ Document Checked                                                         | Field(s) Asserted                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------- |
| `clubs/{clubId}/groups/{groupId}/subgroups/{subGroupId}/allMembers/members` | Youth's `guardiansContacts` includes both guardians |

#### TC-G12: Remove guardian — subgroup guardiansContacts cascade

> Youth is in a subgroup. When a guardian is removed, subgroup allMembers must also be cleaned.

| Step | Action                                                                                     |
| ---- | ------------------------------------------------------------------------------------------ |
| 1    | Setup club + group + subgroup with youth having one guardian in subgroup guardiansContacts |
| 2    | Call `removeGuardianFromYouth`                                                             |

| ✅ Document Checked                                                         | Field(s) Asserted                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `clubs/{clubId}/groups/{groupId}/subgroups/{subGroupId}/allMembers/members` | Youth's `guardiansContacts` no longer contains removed guardian |

#### TC-G13: Add guardian who is inactive in club → reactivation

| Step | Action                                                                 |
| ---- | ---------------------------------------------------------------------- |
| 1    | Setup club + group + youth. Pre-seed guardian2 as inactive club member |
| 2    | Call `addGuardianToYouth` for the inactive guardian2                   |

| ✅ Document Checked                 | Field(s) Asserted                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `clubs/{clubId}/allMembers/members` | Guardian2 `isActive === true`, `roles` includes `"guardian"`                                      |
| `clubs/{clubId}/allMembers/members` | Guardian2 `inactiveSince` and `scheduledForDeletion` are `null` (cleared)                         |
| `users/{guardian2Uid}`              | `clubAccess` entry has `isActive === true`, `inactiveSince` and `scheduledForDeletion` are `null` |

#### TC-G14: Remove guardian not linked to youth → `not-found`

> Attempting to remove a guardian who is not in the youth's guardians array should return `not-found`.

#### TC-G15: Full guardian add → remove → re-add roundtrip

> End-to-end roundtrip verifying `clubAccess` consistency at every stage.
> Catches the class of bug where removal deletes data that re-add cannot restore.

| Phase  | Action                                           | `clubAccess` state                       | Club member state                      |
| ------ | ------------------------------------------------ | ---------------------------------------- | -------------------------------------- |
| Add    | `addGuardianToYouth` (new guardian, not in club) | Entry created, active                    | Added, `isActive: true`                |
| Remove | `removeGuardianFromYouth` (only role)            | `isActive: false`, `inactiveSince` set   | `isActive: false`                      |
| Re-add | `addGuardianToYouth` (reactivation)              | `isActive: true`, inactive fields `null` | `isActive: true`, roles `["guardian"]` |

---

### Suite P: Picture Upload & Firestore Verification

**File:** `functions/test/upload-pictures.test.ts`

> Tests upload of club logos, group pictures, and profile pictures.
> Verifies that pictureUrl / logoUrl / photoURL fields are correctly persisted
> in all concerned Firestore documents. Also tests the `onProfilePictureResized`
> Storage trigger that propagates photoURL across user doc + all member lists.

#### TC-P1: Club admin uploads logo; updateClub stores logoUrl in club doc

| Step | Action                                                              |
| ---- | ------------------------------------------------------------------- |
| 1    | Setup admin + club + group + subgroup                               |
| 2    | Call `uploadClubLogo` with base64 image → returns `logoUrl`         |
| 3    | Call `updateClub` with returned `logoUrl` (mimics client-side flow) |

| ✅ Document Checked | Field(s) Asserted                      |
| ------------------- | -------------------------------------- |
| `clubs/{clubId}`    | `logoUrl` matches the returned logoUrl |

#### TC-P2: Non-admin gets permission denied on uploadClubLogo

#### TC-P3: Invalid content type (text/plain) is rejected on uploadClubLogo

#### TC-P4: Group admin uploads picture; pictureUrl stored in group doc

| Step | Action                                                             |
| ---- | ------------------------------------------------------------------ |
| 1    | Setup admin + club + group                                         |
| 2    | Call `uploadGroupPicture` with base64 image → returns `pictureUrl` |

| ✅ Document Checked               | Field(s) Asserted                            |
| --------------------------------- | -------------------------------------------- |
| `clubs/{clubId}/groups/{groupId}` | `pictureUrl` matches the returned pictureUrl |

#### TC-P5: Non-admin gets permission denied on uploadGroupPicture

#### TC-P6: Invalid content type (application/pdf) is rejected on uploadGroupPicture

#### TC-P7: Club admin uploads profile picture for member → success + returns photoURL

#### TC-P8: Group coach uploads profile picture for group member → success

#### TC-P9: Regular member gets permission denied on uploadProfilePictureForMember

#### TC-P10: Target must be in group for non-club-admin (coach tries for outsider)

#### TC-P10b: Club admin uploads profile picture for member without groupId → success

#### TC-P11: onProfilePictureResized — photoURL propagated to all Firestore locations

> Simulates the Firebase Resize Extension by uploading a file at the
> `profilePictures/users/{uid}/customProfilePictures/profile_200x200.png` path,
> triggering the `onProfilePictureResized` Storage trigger in the Functions emulator.

| Step | Action                                                         |
| ---- | -------------------------------------------------------------- |
| 1    | Setup admin + club + group + subgroup                          |
| 2    | Create member, add to club + group + subgroup member lists     |
| 3    | Upload resized file to Storage emulator to trigger propagation |
| 4    | Poll user doc until `photoURL` appears (up to 15s)             |

| ✅ Document Checked                                                         | Field(s) Asserted                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `users/{uid}`                                                               | `photoURL` contains expected Storage path                      |
| `clubs/{clubId}/allMembers/members`                                         | Member entry `photoURL` contains `profilePictures/users/{uid}` |
| `clubs/{clubId}/groups/{groupId}/allMembers/members`                        | Member entry `photoURL` contains `profilePictures/users/{uid}` |
| `clubs/{clubId}/groups/{groupId}/subgroups/{subGroupId}/allMembers/members` | Member entry `photoURL` contains `profilePictures/users/{uid}` |

---

### Suite N: News Creation & Notification Verification

**File:** `functions/test/news-notifications.test.ts`

> Tests the `createNews` Cloud Function end-to-end: document creation, permissions (club-admin, group admin, group coach, regular player), field validation, role-filtered delivery, youth→guardian notification redirection, and creator-always-included logic.

#### TC-N1: Club admin creates club-level news → document created with correct fields

| Step | Action                                         |
| ---- | ---------------------------------------------- |
| 1    | Setup admin + player in club + group           |
| 2    | Call `createNews` with club-level scope        |
| 3    | Verify `clubs/{clubId}/news/{newsId}` document |

| ✅ Document Checked            | Field(s) Asserted                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `clubs/{clubId}/news/{newsId}` | `title`, `description`, `targetScope.level`, `createdBy`, `isActive`, `recipientUserIds` |

#### TC-N2: Club-level news sends notifications to all recipients

| ✅ Document Checked                    | Field(s) Asserted                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `users/{playerUid}/notifications/{id}` | `type="news"`, `sourceId`, `clubId`, `read=false`, `dismissed=false`, `sourceCollection="news"` |
| `users/{adminUid}/notifications/{id}`  | `type="news"`, `sourceId` present                                                               |

#### TC-N3: Group admin creates group-level news → success with correct scope

#### TC-N4: Group coach creates group-level news → success

#### TC-N5: Regular player cannot create news → `permission-denied`

#### TC-N6: Title exceeding 100 chars → `invalid-argument`

#### TC-N7: Missing required fields → `invalid-argument`

#### TC-N8: News with role filter → only matching roles receive notifications

| ✅ Assertion            | Detail                                              |
| ----------------------- | --------------------------------------------------- |
| Coach gets notification | `type="news"`, `sourceId` matches newsId            |
| Player does **not**     | No notification doc with `sourceId` matching newsId |

#### TC-N9: Youth member's guardian receives the notification instead of youth

| ✅ Assertion               | Detail                       |
| -------------------------- | ---------------------------- |
| Guardian gets notification | `type="news"`, `sourceId`    |
| Youth does **not**         | No matching notification doc |

#### TC-N10: Creator is always included in recipients

| ✅ Assertion                        | Detail                                       |
| ----------------------------------- | -------------------------------------------- |
| `recipientUserIds` includes creator | Even though roleFilter excludes admin's role |
| Admin gets notification             | `type="news"`, `sourceId` matches newsId     |

#### TC-N11: News with selectedMemberIds → only selected members receive notifications

| ✅ Assertion                     | Detail                                                   |
| -------------------------------- | -------------------------------------------------------- |
| Selected player gets notif       | `type="news"`, `sourceId` matches newsId                 |
| Non-selected player does **not** | No notification doc with `sourceId` matching newsId      |
| Creator (admin) gets notif       | Creator always included even if not in selectedMemberIds |

#### TC-N12: News with roleFilter + selectedMemberIds → combined filtering

| ✅ Assertion               | Detail                                          |
| -------------------------- | ----------------------------------------------- |
| Selected player gets notif | Matches both roleFilter and selectedMemberIds   |
| Coach does **not**         | Matches roleFilter but NOT in selectedMemberIds |
| Creator (admin) gets notif | Creator always included                         |

#### TC-N13: Recipient can add a comment to news

| Step | Action                                                      |
| ---- | ----------------------------------------------------------- |
| 1    | Setup admin + player in club + group, create group news     |
| 2    | Player calls `addNewsComment` with text                     |
| 3    | Verify comment doc in subcollection, `commentCount` on news |

| ✅ Document Checked                                 | Field(s) Asserted                                 |
| --------------------------------------------------- | ------------------------------------------------- |
| `clubs/{clubId}/news/{newsId}/comments/{commentId}` | `text`, `createdBy`, `createdByName`, `createdAt` |
| `clubs/{clubId}/news/{newsId}`                      | `commentCount = 1`                                |

#### TC-N14: Club-admin can add a comment to news

#### TC-N15: Non-recipient cannot add a comment → `permission-denied`

#### TC-N16: Rejects empty and too-long comment text → `invalid-argument`

| ✅ Assertion          | Detail             |
| --------------------- | ------------------ |
| Whitespace-only fails | `invalid-argument` |
| >500 chars fails      | `invalid-argument` |

#### TC-N17: Comment author can delete their own comment

| Step | Action                                                      |
| ---- | ----------------------------------------------------------- |
| 1    | Player adds comment, then calls `deleteNewsComment`         |
| 2    | Verify comment doc deleted, `commentCount` decremented to 0 |

#### TC-N18: News creator can delete any comment

#### TC-N19: Club-admin can delete any comment

#### TC-N20: Regular player cannot delete another player's comment → `permission-denied`

#### TC-N21: Group coach can delete comments on group news

| Step | Action                                                        |
| ---- | ------------------------------------------------------------- |
| 1    | Setup coach in group, player adds comment                     |
| 2    | Coach calls `deleteNewsComment` on player's comment → success |

#### TC-N22: readBy entry stores userName when provided

| Step | Action                                                               |
| ---- | -------------------------------------------------------------------- |
| 1    | Create news via `createNews`                                         |
| 2    | Write readBy entry with `userId`, `userName`, `readAt` via admin SDK |
| 3    | Verify readBy array length = 1, userName matches, readAt is defined  |

#### TC-N23: readBy entry without userName remains valid (backward compat)

| Step | Action                                                                |
| ---- | --------------------------------------------------------------------- |
| 1    | Create news via `createNews`                                          |
| 2    | Write readBy entry with `userId`, `readAt` only (no userName)         |
| 3    | Verify readBy[0].userName is undefined, userId and readAt are correct |

#### TC-N24: Multiple readers stored in readBy array

| Step | Action                                                             |
| ---- | ------------------------------------------------------------------ |
| 1    | Create news via `createNews`                                       |
| 2    | Two users mark as read (both with userName)                        |
| 3    | Verify readBy has 2 entries, readCount = 2, both have userName set |

---

### Suite Q: Notification Side-Effects Across Cloud Functions

**File:** `functions/test/notification-side-effects.test.ts`

> Verifies that Cloud Functions which send notifications as a side-effect actually create correctly structured notification documents in `users/{uid}/notifications`. Covers `createEventV2`, `sendGroupInvitation`, `createMembershipFee`, and the `createNotification` callable.

#### TC-Q1: createEventV2 creates notification with type "event" and sourceId

| ✅ Document Checked                    | Field(s) Asserted                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `users/{playerUid}/notifications/{id}` | `type="event"`, `sourceId=eventId`, `sourceCollection="events"`, `read=false`, `dismissed=false`, `clubId` |

#### TC-Q2: sendGroupInvitation creates notification with type "group_invitation" and invitationToken

| ✅ Document Checked                     | Field(s) Asserted                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `users/{inviteeUid}/notifications/{id}` | `type="group_invitation"`, `invitationToken`, `clubId`, `read=false`, `dismissed=false` |

#### TC-Q3: createMembershipFee creates notification with type "payment_request" and metadata

| ✅ Document Checked                    | Field(s) Asserted                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users/{playerUid}/notifications/{id}` | `type="payment_request"`, `sourceId=feeId`, `sourceCollection="membershipFees"`, `priority="high"`, `metadata.feeId`, `metadata.amount=50000`, `metadata.currency="sek"` |

#### TC-Q4: createNotification callable creates doc with read:false and dismissed:false

| ✅ Document Checked                    | Field(s) Asserted                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `users/{playerUid}/notifications/{id}` | `type="general"`, `title`, `message`, `read=false`, `dismissed=false`, `clubId`, `priority="normal"` |

#### TC-Q5: createNotification without auth → `unauthenticated`

#### TC-Q6: createNotification for non-existent user → `not-found`

#### TC-Q7: createNotification succeeds even when Expo Push API is unreachable

| ✅ Contract Verified                           | Detail                                           |
| ---------------------------------------------- | ------------------------------------------------ |
| Callable returns `success: true`               | Push failure does not throw                      |
| `users/{playerUid}/notifications/{id}` written | `title`, `read=false`, `dismissed=false` present |

#### TC-Q8: createNotification embeds notificationId and userId in push data payload

| ✅ Contract Verified                          | Detail                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Callable returns `notificationId`             | String, non-empty                                                                                                  |
| `users/{playerUid}/notifications/{id}` exists | Document ID matches returned `notificationId`                                                                      |
| Mark-as-read contract documented              | Push data `notificationId`+`userId` consumed by `redirectFromNotification` on tap to call `markNotificationAsRead` |

---

### Suite R: Push Notification Dispatch

**File:** `functions/test/push-notifications.test.ts`

> Tests `sendPushNotification()` directly (ts-jest import, no emulator HTTP call). Mocks `global.fetch` to simulate Expo Push API responses.

| Test | Description                                                        |
| ---- | ------------------------------------------------------------------ |
| R1   | No-op when user has no push tokens — `fetch` never called          |
| R2   | Sends to all registered devices — correct payload shape            |
| R3   | Removes `DeviceNotRegistered` token, keeps valid token             |
| R4   | Multiple devices, partial failure cleans up only invalid tokens    |
| R5   | Correct `channelId` / `categoryIdentifier` per notification type   |
| R6   | Network error does not throw (graceful degradation)                |
| R6b  | Expo API 500 error does not throw                                  |
| R7   | Firestore notification written even when push fails (via callable) |
| R8   | `payment_request` → `priority="high"`, `channelId="payments"`      |

---

### Test Case Count Summary

| Suite                          | File                                    | Cases  |
| ------------------------------ | --------------------------------------- | ------ |
| A. Add Member — New Users      | `invitation-add-new-users.test.ts`      | 6      |
| B. Add Member — Existing Users | `invitation-add-existing-users.test.ts` | 8      |
| C. Remove Member               | `remove-member-flows.test.ts`           | 7      |
| D. Subgroup Members            | `subgroup-member-flows.test.ts`         | 3      |
| E. CRUD Lifecycle              | `crud-lifecycle.test.ts`                | 12     |
| G. Guardian Flows              | `guardian-flows.test.ts`                | 15     |
| N. News & Notifications        | `news-notifications.test.ts`            | 21     |
| P. Picture Uploads             | `upload-pictures.test.ts`               | 11     |
| Q. Notification Side-Effects   | `notification-side-effects.test.ts`     | 8      |
| R. Push Notifications          | `push-notifications.test.ts`            | 9      |
| **Total new**                  |                                         | **88** |

### Implementation Priority

| Priority | Suite             | Reason                                                                |
| -------- | ----------------- | --------------------------------------------------------------------- |
| **P0**   | Suite A + Suite B | Tests the invitation acceptance flow — where all recent bugs occurred |
| **P1**   | Suite C           | Complex orchestration with cascade effects and guardian cleanup       |
| **P2**   | Suite D + Suite E | Simpler operations, extend existing coverage                          |

---

## Manual / QA Test Cases — Event Cancellation & Recurring Events

> **Scope:** These are **manual / QA checklists** for verifying UI behaviour, visual styling, and end-to-end user flows that cannot be covered by backend integration tests alone. They are meant to be executed by a human tester in the running app.
>
> **Automated coverage:** The backend logic for these features (`cancelEvent`, `createRecurringEvent`, `editRecurringEvent`) is fully covered by **46 automated integration tests** in `functions/test/event-cancellation-recurring.test.ts` — see [section 5b](#5b-event-cancellation--recurring-events-event-cancellation-recurringtestts--46-tests) in the Test Cases Catalogue above.

### Phase 1: Event Cancellation

#### TC-C01: Cancel a Single Event (Happy Path)

**Preconditions:** User is event creator or group admin/coach. Event status is "scheduled".
**Steps:**

1. Open event details for a scheduled event
2. Tap the red X (close-circle) icon in the header
3. Optionally enter a cancellation reason
4. Tap "Cancel Event"
   **Expected:**

- Event status changes to "cancelled"
- Cancelled banner appears on EventCard and event-details
- All invitees receive `event_cancelled` notification
- Edit icon disappears from header
- Cancel icon disappears from header
- Response section is hidden
- Attendance recording section is hidden

#### TC-C02: Cancel Event with Reason

**Steps:** Same as TC-C01 but enter "Weather conditions" as reason
**Expected:** Reason appears in the cancelled banner: "Reason: Weather conditions"

#### TC-C03: Cancel Event without Reason

**Steps:** Same as TC-C01 but leave reason blank
**Expected:** Cancelled banner shows without reason line

#### TC-C04: Cannot Cancel Already Cancelled Event

**Preconditions:** Event is already cancelled
**Expected:** Cancel icon not visible in header (canShowCancel is false)

#### TC-C05: Cannot Cancel Completed Event

**Preconditions:** Event status is "completed"
**Expected:** Cancel icon not visible in header

#### TC-C06: Permission — Creator Can Cancel

**Preconditions:** Logged in as event creator
**Expected:** Cancel icon visible and functional

#### TC-C07: Permission — Club Admin Can Cancel

**Preconditions:** Logged in as club admin (not creator)
**Expected:** Cancel icon visible and functional

#### TC-C08: Permission — Group Admin/Coach Can Cancel

**Preconditions:** Logged in as group admin or coach (not creator)
**Expected:** Cancel icon visible and functional

#### TC-C09: Permission — Regular Member Cannot Cancel

**Preconditions:** Logged in as regular member/player
**Expected:** Cancel icon not visible

#### TC-C10: Cancelled Event Styling on EventCard

**Expected:**

- Card has reduced opacity (0.85) and red border
- Red "CANCELLED" banner shows at top
- Event type icon is dimmed
- Status text shows "Cancelled" instead of user's response
- Deadline approaching warning is hidden

---

### Phase 2: Recurring Events

#### Create Recurring Event

#### TC-R01: Create Weekly Recurring Event (End by Date)

**Preconditions:** User is on create-event screen, Advanced mode
**Steps:**

1. Fill in event details (title, type, time, location)
2. Check "Make this a recurring event"
3. Verify frequency defaults to "Weekly"
4. Verify end condition defaults to "By Date"
5. Verify "Every [Day]" label matches start date day
6. Set series end date to 2 months from now
7. Verify summary shows estimated occurrence count
8. Tap "Create Series (N events)"
   **Expected:**

- RecurringEventMaster created at `/clubs/{clubId}/recurringEvents/{id}`
- N individual EventDocuments created at `/clubs/{clubId}/events/`
- Each occurrence has: `isRecurring: true`, `recurringEventId`, `occurrenceIndex`, `isModified: false`
- Occurrences are spaced exactly 7 days apart
- First notification sent to all invitees
- Success modal shows occurrence count and recipient count

#### TC-R02: Create Bi-weekly Recurring Event (End by Count)

**Steps:**

1. Fill event details, enable recurring
2. Select "Bi-weekly" frequency
3. Select "After Count" end condition
4. Enter 10 occurrences
5. Create
   **Expected:**

- 10 occurrences created, each spaced 14 days apart
- Summary shows "10 occurrences, bi-weekly on [Day]"

#### TC-R03: Create Monthly Recurring Event

**Steps:**

1. Set start date to 15th of current month
2. Enable recurring, select "Monthly"
3. Set end condition
   **Expected:**

- Occurrences fall on 15th of each subsequent month
- Master document has `dayOfMonth: 15`

#### TC-R04: Occurrence Count Validation

**Steps:** Try entering 0, 1, 53, -1, "abc"
**Expected:**

- Values outside 2-52 range are rejected
- Only valid integers accepted

#### TC-R05: Recurring Section Only in Advanced Mode

**Steps:** Toggle between Simple and Advanced mode
**Expected:**

- Recurring section is not visible in Simple mode
- Recurring section is visible in Advanced mode

#### TC-R06: Recurring Section Not in Edit Mode

**Preconditions:** Navigate to create-event in edit mode
**Expected:** Recurring section is not visible

#### TC-R07: Day Name Updates with Start Date

**Steps:**

1. Enable recurring
2. Change start date from Monday to Wednesday
   **Expected:** "Every [Day]" label updates from "Every Monday" to "Every Wednesday"

#### TC-R08: Summary Updates Dynamically

**Steps:** Change frequency, end type, end date, occurrence count
**Expected:** Summary text updates in real-time

---

#### EventCard & Event Details — Recurring Badge

#### TC-R09: Recurring Badge on EventCard

**Preconditions:** Event has `isRecurring: true`
**Expected:**

- Green recurring badge with repeat icon shows below card top
- Badge text shows localized "Recurring"
- Badge does NOT show on cancelled recurring events

#### TC-R10: Recurring Badge on Event Details

**Preconditions:** View details of a recurring event
**Expected:**

- Green recurring badge shows with "Recurring Event (#N)" where N is occurrence number
- If occurrence is modified, "(modified)" shows next to badge

---

#### Cancel Recurring Event

#### TC-R11: Cancel Single Occurrence

**Preconditions:** View a recurring event occurrence
**Steps:**

1. Tap cancel icon in header
2. Scope modal appears: "This occurrence only" / "All future occurrences"
3. Select "This occurrence only"
4. Cancel confirmation modal appears
5. Optionally enter reason
6. Confirm cancel
   **Expected:**

- Only this single occurrence is cancelled
- Other occurrences remain scheduled
- Master document status remains "active"
- Notification sent to invitees of this occurrence

#### TC-R12: Cancel All Future Occurrences

**Steps:**

1. Tap cancel icon on occurrence #3 (of 10)
2. Select "All future occurrences"
3. Confirm cancel
   **Expected:**

- Occurrences #3-10 are cancelled (8 events)
- Occurrences #1-2 remain unchanged
- Individually modified future occurrences are SKIPPED (remain as-is)
- If all occurrences end up cancelled/completed, master status → "cancelled"
- Notification sent to all unique users across cancelled occurrences

#### TC-R13: Cancel Future — Skips Modified Occurrences

**Preconditions:** Occurrence #5 was previously edited (isModified: true)
**Steps:** Cancel all future from occurrence #3
**Expected:** Occurrences #3,4,6,7,...,10 are cancelled. Occurrence #5 is NOT cancelled (skipped because modified).

#### TC-R14: Cancel Scope Modal Not Shown for Single Events

**Preconditions:** Single (non-recurring) event
**Steps:** Tap cancel icon
**Expected:** Goes directly to cancel confirmation modal (no scope selection)

---

#### Edit Recurring Event

#### TC-R15: Edit Single Occurrence

**Steps:**

1. Tap edit icon on a recurring event
2. Scope modal appears
3. Select "This occurrence only"
4. Edit screen opens with event data pre-filled
5. Change title and save
   **Expected:**

- Only this occurrence's title is updated
- `isModified` is set to `true` on this occurrence
- Master document unchanged
- Other occurrences unchanged

#### TC-R16: Edit All Future Occurrences

**Steps:**

1. Tap edit on occurrence #4
2. Select "All future occurrences"
3. Change location and time
   **Expected:**

- Occurrences #4-end are updated with new location and time
- Time changes: only time-of-day is updated (date stays)
- Individually modified occurrences are SKIPPED
- Master template is updated with new values
- Past occurrences (#1-3) are unchanged

#### TC-R17: Edit Scope Modal Not Shown for Single Events

**Preconditions:** Single event
**Steps:** Tap edit icon
**Expected:** Goes directly to edit screen (no scope selection)

---

#### Notifications

#### TC-R18: Recurring Event Creation Notification

**Expected:**

- Single notification sent mentioning "Recurring Event" with frequency and occurrence count
- Links to first occurrence

#### TC-R19: Cancel Future Notifications

**Expected:**

- Notification message mentions scope: "and N future occurrence(s)"
- All unique affected users receive notification

---

#### Edge Cases

#### TC-R20: Create Event — Network Error During Recurring Creation

**Steps:** Trigger network error during creation
**Expected:**

- No partial data written (batch is atomic)
- Error message shown
- Button re-enabled

#### TC-R21: Very Long Series (52 occurrences)

**Steps:** Create weekly event with 52 occurrences
**Expected:**

- All 52 created within batch limit (53 writes total including master)
- Performance acceptable

#### TC-R22: Monthly Event on 31st

**Steps:** Start monthly event on Jan 31
**Expected:**

- February occurrence falls on Feb 28/29
- March occurrence on March 31
- April occurrence on April 30 (JavaScript Date handles month overflow)

#### TC-R23: Cancel Last Remaining Occurrence

**Preconditions:** All but one occurrence are cancelled
**Steps:** Cancel the last active occurrence
**Expected:** Master status changes to "cancelled"

#### TC-R24: i18n — All Locales Render

**Steps:** Switch language to each of the 8 locales
**Expected:**

- All recurring event labels render without missing key warnings
- Frequency pills show translated text
- Scope modal options show in correct language
- Badge text is translated

---

### Phase 3: Club Admin Group Navigation (Manage Club → Manage Group)

#### TC-GN01: Club admin can open all active groups from Manage Club

**Preconditions:** User has `club-admin` role in the selected club. Club has at least 3 active groups. User is only a player/member in one of them.
**Steps:**

1. From Home, open the club card
2. Open `manage-club`
3. Switch to **Groups** tab
4. Tap Group A, then back
5. Tap Group B, then back
6. Tap Group C
   **Expected:**

- Each tap opens `manage-group` for that exact group
- No infinite spinner on Group B/C when user lacks explicit `groupAccess` entries
- Group header title matches tapped group name

#### TC-GN02: Missing context data does not spin forever

**Preconditions:** Simulate delayed/missing group context for a tapped group (e.g., by throttling network or forcing stale profile cache).
**Steps:**

1. Navigate to a group from `manage-club`
2. Observe loading state for ~7 seconds
   **Expected:**

- Screen exits loading state (no permanent spinner)
- If group cannot be resolved, user sees "group not found" fallback with **Go Back** action

#### TC-GN03: Club admin fallback data path still shows members correctly

**Preconditions:** Club admin opens a group they can manage but are not directly listed under their profile's `groupAccess`.
**Steps:**

1. Open that group from `manage-club`
2. Verify Members tab list count
3. Open News/Event FAB flows
   **Expected:**

- Members list renders from fallback listeners
- Group name and member count are correct
- Create News / Create Event navigation receives correct `groupId` and `groupName`

**Automated regression:** `functions/test/manage-group-screen-state.test.ts` validates the loading-state guard for unresolved groups so this spinner regression is caught in CI.

---

#### Manual / QA Test Case Summary

> These are **manual checklists** — not automated. For the 46 automated integration tests, see [section 5b](#5b-event-cancellation--recurring-events-event-cancellation-recurringtestts--46-tests).

| Area                       | Cases  | IDs               | Type   |
| -------------------------- | ------ | ----------------- | ------ |
| Event Cancellation         | 10     | TC-C01 – TC-C10   | Manual |
| Recurring — Create         | 8      | TC-R01 – TC-R08   | Manual |
| Recurring — Badges         | 2      | TC-R09 – TC-R10   | Manual |
| Recurring — Cancel (scope) | 4      | TC-R11 – TC-R14   | Manual |
| Recurring — Edit (scope)   | 3      | TC-R15 – TC-R17   | Manual |
| Recurring — Notifications  | 2      | TC-R18 – TC-R19   | Manual |
| Recurring — Edge Cases     | 5      | TC-R20 – TC-R24   | Manual |
| Group Navigation           | 3      | TC-GN01 – TC-GN03 | Manual |
| **Total**                  | **37** |                   |        |

---

## Expansion Roadmap

### Layer 1: Backend Cloud Functions (Partially Complete ✅)

Emulator-based integration tests now cover 39 of ~100 functions (~39%).

**Completed:**

- ✅ Clubs (4/9 functions)
- ✅ Groups & Subgroups (7/14 functions)
- ✅ Members & Fees (10/19 functions)
- ✅ Auth & user management (4/7 functions)
- ✅ Events & attendance (10/13 functions)
- ✅ Invitations (4/6 functions)

**Remaining (priority order):**

1. LOK/RF integration (11 functions) — personnummer handling, LOK reports, RF API
2. Legal (2 functions) — News now covered by Suite N
3. User doc management (5 functions) — club/group info updates, inactivity marking
4. Cascade operations — deletion, reactivation side-effects
5. Remaining gaps in covered domains (e.g., `getClubMembers`, `getGroupMembers`)
6. ✅ `cancelEvent`, `createRecurringEvent`, `editRecurringEvent` — 46 automated integration tests in `event-cancellation-recurring.test.ts`; additional manual/QA UI checklists documented in [Manual / QA Test Cases](#manual--qa-test-cases--event-cancellation--recurring-events)

### Layer 2: Pure Logic Unit Tests (Partially Complete ✅)

Fast, no-emulator tests for pure functions. 127 tests running in <1s.

**Completed:**

- ✅ `functions/src/utils/validation.ts` — all 8 exported functions (24 tests)
- ✅ `functions/src/utils/roleValidation.ts` — all 8 exported functions (16 tests)
- ✅ `functions/src/utils/limits.ts` — all 8 exported functions (20 tests)
- ✅ `functions/src/lok/lokValidation.ts` — all 4 exported functions (22 tests)
- ✅ `utils/permissionHelpers.ts` — all 9 exported functions (45 tests) — covers real-time listener permission layer

**Remaining candidates:**

- `functions/src/config/stripeFeeEstimates.ts` — fee calculations
- `services/lok/lokValidationService.ts` — client-side LOK validation
- `services/lok/personnummerService.ts` — format functions only
- `services/statistics/statisticsService.ts` — filter/sort helpers
- `services/constants/index.ts` — constant integrity

### Layer 3: Frontend Service Tests (Partially Complete)

**Completed:**

- ✅ **permissionHelpers.ts** — Pure synchronous permission checks fully unit-tested (45 tests). Replaced async `permissionService` which was untestable without mocking.

**What's testable now that screens use real-time listeners:**

- **Context providers** (UserContext, ClubDataContext, GroupDataContext) are React contexts wrapping Firestore `onSnapshot` — integration-testing them requires either React Testing Library with mocked Firestore, or full emulator-based rendering. Not yet implemented.
- **Orchestration services** (multi-step workflows) could verify call sequencing with mocked Cloud Functions
- **Pure helper functions** within services can be extracted and unit-tested

### Layer 4: Security Rules Tests (Future)

Test Firestore security rules with `@firebase/rules-unit-testing`.

### Layer 5: Frontend E2E (Future)

Detox (native) or Maestro for full user flow testing.
