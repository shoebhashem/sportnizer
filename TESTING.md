# 🧪 Clubnizer Testing Documentation

## Table of Contents

- [Current Test Suite Overview](#current-test-suite-overview)
- [Test Infrastructure](#test-infrastructure)
- [Test Cases Catalogue](#test-cases-catalogue)
- [Coverage Gap Analysis](#coverage-gap-analysis)
- [Expansion Roadmap](#expansion-roadmap)

---

## Current Test Suite Overview

| Metric           | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| **Total tests**  | 188                                                           |
| **Test suites**  | 8                                                             |
| **Test type**    | Integration tests + pure logic unit tests                     |
| **Runner**       | Jest + ts-jest                                                |
| **Backend**      | Firebase Emulator Suite (Auth, Firestore, Functions, Storage) |
| **CI**           | GitHub Actions (`.github/workflows/functions-tests.yml`)      |
| **Avg run time** | ~65s locally                                                  |

### Test Suites

| Suite                 | File                                      | Tests | Domain                                    |
| --------------------- | ----------------------------------------- | ----- | ----------------------------------------- |
| Club Lifecycle        | `functions/test/clubs.test.ts`            | 10    | Create, get, update, delete + permissions |
| Group Lifecycle       | `functions/test/groups.test.ts`           | 12    | CRUD + cascade delete to subgroups        |
| Subgroup Lifecycle    | `functions/test/subgroups.test.ts`        | 10    | CRUD + membership add/remove              |
| Members & Fees        | `functions/test/members-and-fees.test.ts` | 14    | Member roles, club roles, fee CRUD        |
| Events & Attendance   | `functions/test/events.test.ts`           | 23    | Event CRUD, RSVP, attendance, statistics  |
| Auth & User Mgmt      | `functions/test/auth.test.ts`             | 18    | Account creation, profiles, verification  |
| Invitation Flows      | `functions/test/invitations.test.ts`      | 19    | Send, validate, accept/reject, delete     |
| Pure Logic Unit Tests | `functions/test/unit-pure-logic.test.ts`  | 82    | Validation, roles, limits, LOK rules      |

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

### 7. Invitation Flows (`invitations.test.ts`) — 19 tests

#### sendGroupInvitation (6 tests)

| #   | Test                                       | What it verifies                                    |
| --- | ------------------------------------------ | --------------------------------------------------- |
| 1   | should send invitation to a new user       | Invitation doc created with token, status `pending` |
| 2   | should send invitation to an existing user | Existing auth user gets invitation                  |
| 3   | should handle multiple email invitations   | Multiple emails → multiple invitation docs created  |
| 4   | should reject empty email array            | Empty array → `internal` (catch-all wrapping)       |
| 5   | should reject missing required fields      | Missing fields → `internal` (catch-all wrapping)    |
| 6   | should reject unauthenticated invitation   | No auth → `internal` (catch-all wrapping)           |

> **Note:** `sendGroupInvitation` has a catch-all error handler that wraps ALL errors (including validation `HttpsError`) as `internal`.

#### validateInvitationToken (4 tests)

| #   | Test                                       | What it verifies                                       |
| --- | ------------------------------------------ | ------------------------------------------------------ |
| 7   | should validate a fresh invitation token   | Returns valid invitation data with `pending` status    |
| 8   | should handle nonexistent token gracefully | Invalid token → soft error (not-found or empty result) |
| 9   | should detect already-used invitation      | Used invitation → appropriate status returned          |
| 10  | should reject missing token parameter      | Missing token → `invalid-argument`                     |

#### markInvitationUsed (3 tests)

| #   | Test                                  | What it verifies                                 |
| --- | ------------------------------------- | ------------------------------------------------ |
| 11  | should delete the invitation document | Doc removed from Firestore (returns `undefined`) |
| 12  | should reject missing required fields | Missing fields → `invalid-argument`              |
| 13  | should reject unauthenticated request | No auth → error                                  |

#### respondToEmailInvite (6 tests)

| #   | Test                                               | What it verifies                                             |
| --- | -------------------------------------------------- | ------------------------------------------------------------ |
| 14  | should reject an invitation                        | Status set to `rejected`                                     |
| 15  | should accept invitation for existing user         | Accept flow executes (resilient assertion for preconditions) |
| 16  | should create pending signup for non-existing user | Unauthenticated accept → pending signup flow triggered       |
| 17  | should reject when token is missing                | Missing token → `invalid-argument`                           |
| 18  | should reject invalid action                       | Invalid action string → `invalid-argument`                   |
| 19  | should handle not-found invitation token           | Nonexistent token → `not-found`                              |

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
2. Legal & News (3 functions)
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
