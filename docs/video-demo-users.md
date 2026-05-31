# Instruction Video – Demo Users & Plan

## Club Used for All Videos
- **Club name:** Your Club
- **Club ID:** `PTZ3F78Sif6G4gdx6dBL`
- **Club admin email:** `hello@clubnizer.com` _(use this account when recording the admin POV)_

---

## Adult Members (with accounts)

| Name | Email | Role(s) | Profile Photo |
|------|-------|---------|--------------|
| Shoeb Hashem | shoeb.hashem@gmail.com | club-admin, coach | ✅ Custom |
| Jordan Lee | tester1@sportnizer.com | guardian, player | ❌ Default (no photo) |
| John Rivera | tester2@sportnizer.com | guardian | ✅ Custom |
| Niclas Kims | tester3@sportnizer.com | guardian | ❌ Default (no photo) |
| Peter Novak | tester4@sportnizer.com | guardian | ❌ Default (no photo) |
| William Silva | tester5@sportnizer.com | guardian | ❌ Default (no photo) |
| John Andersson | tester6@sportnizer.com | guardian | ❌ Default (no photo) |

## Child Members (player-underage, no direct login)

| Name | Guardian | Profile Photo |
|------|---------|--------------|
| Frank Morgan | Jordan Lee (tester1) | ✅ Custom |
| May Lee | Jordan Lee (tester1) | ✅ Custom |
| Frank Rivera | John Rivera (tester2) | ✅ Custom |
| Laura Rivera | John Rivera (tester2) | ✅ Custom |
| Taylor Kim | Niclas Kims (tester3) | ✅ Custom |
| Benjamin Kim | Niclas Kims (tester3) | ✅ Custom |
| Lisa Frank | Niclas Kims (tester3) | ✅ Custom |
| Chris Novak | Peter Novak (tester4) | ✅ Custom |
| Oliver Novak | Peter Novak (tester4) | ✅ Custom |
| Robin Silva | William Silva (tester5) | ❌ Default (no photo) |
| Micheal Lima | William Silva (tester5) | ❌ Default (no photo) |
| Teodor Andersson | John Andersson (tester6) | ❌ Default (no photo) |

---

## Fresh Accounts for "New User" Videos

To demonstrate the **sign-up flow** and **invite a non-existing user** flow, use fresh emails
that do not yet have a Clubnizer account:

| Purpose | Email to use |
|---------|-------------|
| Video 1 – Sign up & verify email | `newuser@clubnizer.com` |
| Video 4 – Invite a non-existing user | `newcoach@clubnizer.com` |

> These accounts should NOT be created in advance. The sign-up/invite flow is what creates them.

---

## Recommended: Account to Delete for "Upload Profile Picture" Video

**Candidate: `tester6@sportnizer.com` (John Andersson)**
- No custom profile picture (uses default icon)
- Guardian of only one child: Teodor Andersson
- Deleting this account lets you show:
  1. Inviting a user who doesn't exist yet
  2. That user signing up and uploading a profile picture for the first time

> ⚠️ Deleting this account will orphan Teodor Andersson's guardian link in the club.
> Re-add John Andersson after recording to restore the data.

---

## Proposed Video Series

| # | Title | Actor | Key steps shown |
|---|-------|-------|----------------|
| 1 | **Get Started – Sign Up** | New user (`newuser@clubnizer.com`) | Sign up → verify email in inbox → sign in → see welcome screen |
| 2 | **Create Your Club** | `hello@clubnizer.com` (admin) | Create club → add name/logo/location → club is live |
| 3 | **Create Groups & Teams** | `hello@clubnizer.com` | Create group → add subgroup → see group hierarchy |
| 4 | **Invite Members** | `hello@clubnizer.com` | Invite existing user (player) + invite non-existing user (coach) |
| 5 | **Accept an Invitation** | `tester1@sportnizer.com` (Jordan Lee) | Receive invite notification → accept → access club |
| 6 | **Add an Underage Player** | `hello@clubnizer.com` | Add child member → link guardian → guardian gets notified |
| 7 | **Upload Your Profile Picture** | `tester6@sportnizer.com` (John Andersson) | Sign in → go to profile → upload photo → save |
| 8 | **Create & Manage Events** | `hello@clubnizer.com` | Create event → assign members → mark attendance |
| 9 | **Post Club News** | `hello@clubnizer.com` | Create news post → members see it in feed |
| 10 | **Fees & Payments** | `hello@clubnizer.com` | Create fee → assign to group → member views and pays |
| 11 | **LOK Reports** | `hello@clubnizer.com` | Set personnummer → edit attendance → generate LOK report |
| 12 | **Club Settings & Roles** | `hello@clubnizer.com` | Manage permissions → change member roles → club settings |
| 13 | **Statistics Overview** | `hello@clubnizer.com` | View member count, group stats, activity summary |

---

## Recording Setup

- **Method:** Playwright with iPhone 14 emulation (390×844)
- **Target:** Live web app (URL to be confirmed)
- **Video output:** `./videos/` folder, one `.webm` file per video
- **Email verification:** Playwright opens Gmail web UI to click the verification link (Video 1 only)
