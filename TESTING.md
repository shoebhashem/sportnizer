# 🧪 Clubnizer Testing Documentation

## Table of Contents

- [Current Test Suite Overview](#current-test-suite-overview)
- [Test Infrastructure](#test-infrastructure)
- [Test Cases Catalogue](#test-cases-catalogue)
- [Coverage Gap Analysis](#coverage-gap-analysis)
- [Level 1 — Backend E2E Integration Test Plan](#level-1--backend-e2e-integration-test-plan)
- [Expansion Roadmap](#expansion-roadmap)

---

## Current Test Suite Overview

| Metric           | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| **Total tests**  | 273                                                           |
| **Test suites**  | 17                                                            |
| **Test type**    | Integration tests + pure logic unit tests                     |
| **Runner**       | Jest + ts-jest                                                |
| **Backend**      | Firebase Emulator Suite (Auth, Firestore, Functions, Storage) |
| **CI**           | GitHub Actions (`.github/workflows/functions-tests.yml`)      |
| **Avg run time** | ~65s locally                                                  |

### Test Suites

| Suite                 | File                                               | Tests | Domain                                                                  |
| --------------------- | -------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Club Lifecycle        | `functions/test/clubs.test.ts`                     | 10    | Create, get, update, delete + permissions                               |
| Group Lifecycle       | `functions/test/groups.test.ts`                    | 12    | CRUD + cascade delete to subgroups                                      |
| Subgroup Lifecycle    | `functions/test/subgroups.test.ts`                 | 10    | CRUD + membership add/remove                                            |
| Members & Fees        | `functions/test/members-and-fees.test.ts`          | 14    | Member roles, club roles, fee CRUD                                      |
| Events & Attendance   | `functions/test/events.test.ts`                    | 23    | Event CRUD, RSVP, attendance, statistics                                |
| Auth & User Mgmt      | `functions/test/auth.test.ts`                      | 18    | Account creation, profiles, verification                                |
| Invitation Flows      | `functions/test/invitations.test.ts`               | 21    | Send, validate, accept/reject, delete, dedup                            |
| Guardian Flows        | `functions/test/guardian-flows.test.ts`            | 14    | Add/remove guardian, role accumulation, subgroup cascade                |
| Picture Uploads       | `functions/test/upload-pictures.test.ts`           | 11    | Upload club/group/profile pics + Firestore propagation                  |
| News & Notifications  | `functions/test/news-notifications.test.ts`        | 10    | News CRUD, permissions, recipient logic, youth→guardian, role filter    |
| Notification Side-Fx  | `functions/test/notification-side-effects.test.ts` | 6     | Event/invitation/fee/callable notification docs + auth/not-found errors |
| Pure Logic Unit Tests | `functions/test/unit-pure-logic.test.ts`           | 82    | Validation, roles, limits, LOK rules                                    |

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

### 5. Events & Attendance (`events.test.ts`) — 23 tests

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

#### updateEventResponse / RSVP (3 tests)

| #   | Test                                 | What it verifies                                   |
| --- | ------------------------------------ | -------------------------------------------------- |
| 14  | should accept an event invitation    | Response recorded as `accepted` in event responses |
| 15  | should decline an event invitation   | Response recorded as `declined`                    |
| 16  | should reject invalid response value | Invalid string → `invalid-argument`                |

#### recordAttendance (4 tests)

| #   | Test                                                | What it verifies                                  |
| --- | --------------------------------------------------- | ------------------------------------------------- |
| 17  | should record attendance and complete an event      | Event `status` set to `completed`, records stored |
| 18  | should reject attendance recording from non-admin   | Non-admin → `permission-denied`                   |
| 19  | should reject recording for already completed event | Already completed → `failed-precondition`         |
| 20  | should handle empty attendance records              | Empty array → error or handles gracefully         |

#### getStatistics (3 tests)

| #   | Test                                           | What it verifies                              |
| --- | ---------------------------------------------- | --------------------------------------------- |
| 21  | should return statistics for empty group       | Returns stats object (zero counts)            |
| 22  | should handle missing required fields          | Missing groupId → `invalid-argument` or error |
| 23  | should reject non-member requesting statistics | Non-member → `permission-denied`              |

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
| 19-22 | `LOK_CONSTANTS`           | 4     | MIN_AGE = 7, MAX_AGE = 25, MIN_DURATION_MINUTES exists, MAX_ACTIVITIES_PER_DAY exists                                                                                        |

---

## Coverage Gap Analysis

### Backend Cloud Functions — Current Coverage

| Domain            | Functions | Tested                                                                                                                                                           | Coverage |
| ----------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Clubs**         | 9         | 4 (`createClub`, `getClub`, `updateClub`, `deleteClub`)                                                                                                          | 44%      |
| **Groups**        | 14        | 7 (`createGroup`, `getGroup`, `updateGroup`, `deleteGroup`, `createSubGroup`, `updateSubGroup`, `deleteSubGroup`)                                                | 50%      |
| **Members**       | 16        | 8 (`addMemberToClub`, `addMemberToGroup`, `removeMemberFromClub`, `updateMemberRole`, `updateClubMemberRole`, `addMemberToSubGroup`, `removeMemberFromSubGroup`) | 50%      |
| **Payments**      | 3         | 2 (`createMembershipFee`, `getMembershipFees`)                                                                                                                   | 67%      |
| **Auth**          | 7         | 4 (`createUserAccount`, `getUserProfile`, `updateUserProfile`, `sendEmailVerification`)                                                                          | 57%      |
| **Events**        | 10        | 7 (`createEventV2`, `getEvent`, `updateEvent`, `deleteEvent`, `updateEventResponse`, `recordAttendance`, `getStatistics`)                                        | 70%      |
| **Invitations**   | 6         | 4 (`sendGroupInvitation`, `validateInvitationToken`, `markInvitationUsed`, `respondToEmailInvite`)                                                               | 67%      |
| **Users**         | 5         | 0                                                                                                                                                                | 0%       |
| **Notifications** | 1         | 0                                                                                                                                                                | 0%       |
| **Stripe**        | 6         | 0                                                                                                                                                                | 0% ★     |
| **Subscriptions** | 5         | 0                                                                                                                                                                | 0% ★     |
| **News**          | 1         | 0                                                                                                                                                                | 0%       |
| **Legal**         | 2         | 0                                                                                                                                                                | 0%       |
| **LOK/RF**        | 11        | 0                                                                                                                                                                | 0%       |
| **Profile**       | 2         | 0                                                                                                                                                                | 0%       |
| **Scheduled**     | 2         | 0                                                                                                                                                                | 0%       |
| **TOTAL**         | **~100**  | **36**                                                                                                                                                           | **~36%** |

★ Stripe/Subscription functions require external Stripe API — need mocking strategy

### Pure Logic Utility Coverage

| Module              | Functions Tested | Coverage |
| ------------------- | ---------------- | -------- |
| `validation.ts`     | 8 / 8            | 100%     |
| `roleValidation.ts` | 8 / 8            | 100%     |
| `limits.ts`         | 8 / 8            | 100%     |
| `lokValidation.ts`  | 4 / 4            | 100%     |

### What's NOT Tested

1. ~~**Auth flow** — user creation, email verification, profile retrieval~~ ✅ Covered
2. ~~**Events** — create, update, delete, RSVP, attendance, statistics~~ ✅ Covered
3. ~~**Invitation system** — send, respond, validate token, process post-signup~~ ✅ Covered
4. **LOK/RF integration** — LOK reports, RF API calls (Cloud Functions)
5. **Legal compliance** — config fetch, acceptance recording
6. **News** — creation with notifications
7. **User doc management** — club info updates, group info updates, inactivity marking
8. **Cascade operations** — club deletion updating all member user docs
9. **Frontend services** — no test coverage at all
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

#### TC-P11: onProfilePictureResized — photoURL propagated to all Firestore locations

> Simulates the Firebase Resize Extension by uploading a file at the
> `profilePictures/{uid}/customProfilePictures/profile_200x200.png` path,
> triggering the `onProfilePictureResized` Storage trigger in the Functions emulator.

| Step | Action                                                         |
| ---- | -------------------------------------------------------------- |
| 1    | Setup admin + club + group + subgroup                          |
| 2    | Create member, add to club + group + subgroup member lists     |
| 3    | Upload resized file to Storage emulator to trigger propagation |
| 4    | Poll user doc until `photoURL` appears (up to 15s)             |

| ✅ Document Checked                                                         | Field(s) Asserted                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `users/{uid}`                                                               | `photoURL` contains expected Storage path                |
| `clubs/{clubId}/allMembers/members`                                         | Member entry `photoURL` contains `profilePictures/{uid}` |
| `clubs/{clubId}/groups/{groupId}/allMembers/members`                        | Member entry `photoURL` contains `profilePictures/{uid}` |
| `clubs/{clubId}/groups/{groupId}/subgroups/{subGroupId}/allMembers/members` | Member entry `photoURL` contains `profilePictures/{uid}` |

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
| N. News & Notifications        | `news-notifications.test.ts`            | 10     |
| P. Picture Uploads             | `upload-pictures.test.ts`               | 11     |
| Q. Notification Side-Effects   | `notification-side-effects.test.ts`     | 6      |
| **Total new**                  |                                         | **78** |

### Implementation Priority

| Priority | Suite             | Reason                                                                |
| -------- | ----------------- | --------------------------------------------------------------------- |
| **P0**   | Suite A + Suite B | Tests the invitation acceptance flow — where all recent bugs occurred |
| **P1**   | Suite C           | Complex orchestration with cascade effects and guardian cleanup       |
| **P2**   | Suite D + Suite E | Simpler operations, extend existing coverage                          |

---

## Expansion Roadmap

### Layer 1: Backend Cloud Functions (Partially Complete ✅)

Emulator-based integration tests now cover 36 of ~100 functions (~36%).

**Completed:**

- ✅ Clubs (4/9 functions)
- ✅ Groups & Subgroups (7/14 functions)
- ✅ Members & Fees (10/19 functions)
- ✅ Auth & user management (4/7 functions)
- ✅ Events & attendance (7/10 functions)
- ✅ Invitations (4/6 functions)

**Remaining (priority order):**

1. LOK/RF integration (11 functions) — personnummer handling, LOK reports, RF API
2. Legal (2 functions) — News now covered by Suite N
3. User doc management (5 functions) — club/group info updates, inactivity marking
4. Cascade operations — deletion, reactivation side-effects
5. Remaining gaps in covered domains (e.g., `getClubMembers`, `getGroupMembers`, recurring events)

### Layer 2: Pure Logic Unit Tests (Partially Complete ✅)

Fast, no-emulator tests for pure functions. 82 tests running in <1s.

**Completed:**

- ✅ `functions/src/utils/validation.ts` — all 8 exported functions (24 tests)
- ✅ `functions/src/utils/roleValidation.ts` — all 8 exported functions (16 tests)
- ✅ `functions/src/utils/limits.ts` — all 8 exported functions (20 tests)
- ✅ `functions/src/lok/lokValidation.ts` — all 4 exported functions (22 tests)

**Remaining candidates:**

- `functions/src/config/stripeFeeEstimates.ts` — fee calculations
- `services/lok/lokValidationService.ts` — client-side LOK validation
- `services/lok/personnummerService.ts` — format functions only
- `services/statistics/statisticsService.ts` — filter/sort helpers
- `services/constants/index.ts` — constant integrity

### Layer 3: Frontend Service Tests (New — Possible)

**What's testable:** Services that are thin Cloud Function wrappers can't be meaningfully unit-tested without mocking everything. However:

- **Orchestration services** (multi-step workflows) could verify call sequencing with mocked Cloud Functions
- **Pure helper functions** within services can be extracted and unit-tested
- **Permissions logic** caching and role resolution logic

### Layer 4: Security Rules Tests (Future)

Test Firestore security rules with `@firebase/rules-unit-testing`.

### Layer 5: Frontend E2E (Future)

Detox (native) or Maestro for full user flow testing.
