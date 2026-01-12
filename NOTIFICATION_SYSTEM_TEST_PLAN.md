# Notification System Test Plan (Version 3.0)

## Overview
This document outlines the comprehensive testing strategy for the dual-storage notification system implemented in Version 3.0.

---

## Test Environment Setup

### Prerequisites
- [ ] Firebase project with Firestore enabled
- [ ] Firebase Functions deployed
- [ ] Firestore security rules updated and deployed
- [ ] Test users created (minimum 3):
  - User A: Existing user with verified email
  - User B: Existing user with verified email
  - User C: New user (will sign up via invitation)

### Test Data Setup
- [ ] Create test club with ID
- [ ] Create test group within club
- [ ] Assign User A as coach/admin with invitation permissions
- [ ] User B should NOT be member of test group initially
- [ ] User C email should NOT exist in users collection

---

## Phase 1: Backend Function Tests

### Test 1.1: Create Notification Function
**Objective:** Verify `createNotification` function works correctly

**Test Cases:**

#### TC1.1.1: Group Invitation Notification
```
Input:
- userId: [User B UID]
- type: 'group_invitation'
- title: 'Group Invitation'
- body: 'You've been invited to Test Group'
- data: { invitationToken: 'test_token_123', clubId: '...', groupId: '...' }

Expected Output:
- Success: true
- notificationId: [valid ID]
- Firestore: Document created at users/[UserB]/notifications/[notificationId]
- Fields present: id, userId, type, title, body, data, timestamp, read, dismissed
```

**Verification Steps:**
1. Call function via Firebase console or API
2. Check Firestore console for notification document
3. Verify all required fields are present
4. Verify timestamp is server timestamp
5. Verify read = false, dismissed = false

#### TC1.1.2: Invalid User ID
```
Input:
- userId: 'invalid_user_id'
- type: 'group_invitation'
- ... (other valid fields)

Expected Output:
- Success: false
- Error: 'User not found'
```

#### TC1.1.3: Missing Required Fields
```
Input:
- userId: [valid]
- type: 'group_invitation'
- title: 'Test'
- body: '' (empty)

Expected Output:
- Success: false
- Error: Validation error
```

### Test 1.2: Send Group Invitation Function
**Objective:** Verify dual-write logic for existing vs new users

#### TC1.2.1: Existing User Invitation (Dual-Write)
```
Input:
- email: [User B email]
- clubId: [test club]
- groupId: [test group]
- inviterUid: [User A UID]
- ... (other required fields)

Expected Output:
- Success: true
- isExistingUser: true
- invitationId: [valid token]

Verification:
1. Check invitations/[token] document exists
2. Check users/[UserB]/notifications/[id] document exists
3. Verify notification has correct invitationToken in data
4. Verify invitation has status='pending'
5. Verify invitation has isExistingUser=true
6. Verify invitation has userId field
```

#### TC1.2.2: New User Invitation (Email Only)
```
Input:
- email: [User C email - not in system]
- clubId: [test club]
- groupId: [test group]
- inviterUid: [User A UID]
- ... (other required fields)

Expected Output:
- Success: true
- isExistingUser: false
- invitationId: [valid token]

Verification:
1. Check invitations/[token] document exists
2. Verify NO notification created (user doesn't exist yet)
3. Verify email sent (check logs or email service)
4. Verify invitation has status='pending'
5. Verify invitation has isExistingUser=false
6. Verify invitation has userId=null
```

---

## Phase 2: Frontend Service Tests

### Test 2.1: Real-Time Notification Subscription
**Objective:** Verify `subscribeToUserNotifications` provides live updates

#### TC2.1.1: Initial Load
```
Setup:
- Create 3 notifications for User B
- Subscribe to notifications

Expected Behavior:
- Callback receives array of 3 notifications
- Notifications sorted by timestamp (newest first)
- All notification fields populated correctly
```

#### TC2.1.2: Real-Time Update (New Notification)
```
Setup:
- Subscribe to User B notifications
- Create new notification via backend function

Expected Behavior:
- Callback automatically triggered with updated array
- New notification appears in list
- Badge count increases
- No manual refresh needed
```

#### TC2.1.3: Real-Time Update (Mark as Read)
```
Setup:
- Subscribe to User B notifications
- Call markNotificationAsRead()

Expected Behavior:
- Callback triggered with updated notification
- Notification read status = true
- Badge count decreases
```

### Test 2.2: Notification Actions
**Objective:** Verify notification management functions

#### TC2.2.1: Mark Single as Read
```
Test:
- Get unread notification ID
- Call markNotificationAsRead(userId, notificationId)
- Verify Firestore document updated
- Verify read=true, readAt=timestamp
```

#### TC2.2.2: Mark All as Read
```
Test:
- Create 5 unread notifications
- Call markAllNotificationsAsRead(userId)
- Verify all 5 notifications updated
- Verify badge count = 0
```

#### TC2.2.3: Dismiss Notification
```
Test:
- Get notification ID
- Call dismissNotification(userId, notificationId)
- Verify dismissed=true
- Verify notification no longer appears in list
- Verify dismissedAt timestamp set
```

#### TC2.2.4: Unread Count Query
```
Test:
- Create 3 read, 5 unread notifications
- Call getUnreadNotificationCount(userId)
- Verify returns 5
```

---

## Phase 3: UI Component Tests

### Test 3.1: NotificationBell Component
**Objective:** Verify UI component behavior and interactions

#### TC3.1.1: Badge Display
```
Setup:
- Login as User B
- Ensure 3 unread notifications exist

Expected Behavior:
- Bell icon displays badge with "3"
- Badge is red/visible
- Badge updates in real-time when new notification arrives
```

#### TC3.1.2: Badge Over 99
```
Setup:
- Create 100+ unread notifications

Expected Behavior:
- Badge displays "99+"
- Badge still clickable
```

#### TC3.1.3: No Badge When Zero
```
Setup:
- Mark all notifications as read

Expected Behavior:
- No badge displayed
- Bell icon still visible and clickable
```

#### TC3.1.4: Modal Open/Close
```
Test:
1. Click bell icon
2. Verify modal opens with notification list
3. Click outside modal or X button
4. Verify modal closes
```

#### TC3.1.5: Notification List Display
```
Setup:
- Create 3 notifications of different types

Expected Behavior:
- All 3 notifications displayed
- Correct icons for each type (user-plus, bullhorn, calendar)
- Unread notifications highlighted
- Timestamps formatted correctly ("5m ago", "2h ago")
```

#### TC3.1.6: Notification Click (Invitation)
```
Test:
1. Click on group_invitation notification
2. Verify invitation modal opens
3. Verify correct invitation data loaded
4. Verify notification marked as read
```

#### TC3.1.7: Dismiss Notification
```
Test:
1. Open notification modal
2. Click X button on notification
3. Verify notification disappears from list
4. Verify badge count decreases
5. Verify notification dismissed in Firestore
```

#### TC3.1.8: Mark All as Read
```
Test:
1. Have 5 unread notifications
2. Open modal
3. Click "Mark all read"
4. Verify all notifications change to read style
5. Verify badge disappears
```

### Test 3.2: Home Screen Integration
**Objective:** Verify notification bell in header

#### TC3.2.1: Header Layout
```
Test:
- Navigate to home screen
- Verify bell icon in header (right side)
- Verify bell doesn't overlap with title
- Verify responsive layout on different screen sizes
```

#### TC3.2.2: Invitation Flow from Notification
```
Test:
1. Receive group invitation notification
2. Click bell icon
3. Click invitation notification
4. Verify invitation modal opens
5. Accept invitation
6. Verify notification dismissed automatically
7. Verify joined group successfully
```

---

## Phase 4: Orchestration Service Tests

### Test 4.1: Invitation Response with Notification Cleanup
**Objective:** Verify notification cleanup after invitation response

#### TC4.1.1: Accept Invitation (Existing User)
```
Setup:
- User B has pending invitation
- User B has notification for invitation

Test:
1. Login as User B
2. Accept invitation via processInvitationAfterUserResponse
3. Verify invitation status = 'accepted'
4. Verify notification dismissed automatically
5. Verify notification has dismissedAt timestamp
6. Verify user added to group
7. Verify notification disappears from bell
```

#### TC4.1.2: Reject Invitation (Existing User)
```
Setup:
- User B has pending invitation
- User B has notification for invitation

Test:
1. Login as User B
2. Reject invitation via processInvitationAfterUserResponse
3. Verify invitation status = 'rejected'
4. Verify notification dismissed automatically
5. Verify user NOT added to group
6. Verify notification disappears from bell
```

#### TC4.1.3: Accept Invitation (New User - No Notification)
```
Setup:
- User C receives email invitation
- User C signs up and creates account
- No notification exists (was email invitation)

Test:
1. User C accepts invitation during/after signup
2. Verify invitation status = 'accepted'
3. Verify NO error when notification cleanup runs
4. Verify graceful handling of missing notification
5. Verify user added to group successfully
```

---

## Phase 5: Security Rules Tests

### Test 5.1: Notifications Subcollection Rules
**Objective:** Verify security rules protect user notifications

#### TC5.1.1: User Can Read Own Notifications
```
Test:
- Login as User B
- Query users/[UserB]/notifications
- Expected: SUCCESS with User B's notifications
```

#### TC5.1.2: User Cannot Read Other's Notifications
```
Test:
- Login as User B
- Query users/[UserA]/notifications
- Expected: PERMISSION DENIED
```

#### TC5.1.3: User Cannot Create Notification Directly
```
Test:
- Login as User B
- Try to create document in users/[UserB]/notifications
- Expected: PERMISSION DENIED (only backend can create)
```

#### TC5.1.4: User Can Update Own Notification (Read Status)
```
Test:
- Login as User B
- Update users/[UserB]/notifications/[id] with read=true
- Expected: SUCCESS
```

#### TC5.1.5: User Cannot Update Other Fields
```
Test:
- Login as User B
- Try to update users/[UserB]/notifications/[id] with title='hacked'
- Expected: PERMISSION DENIED
```

#### TC5.1.6: User Can Delete Own Notification
```
Test:
- Login as User B
- Delete users/[UserB]/notifications/[id]
- Expected: SUCCESS
```

### Test 5.2: Invitations Collection Rules
**Objective:** Verify invitation security

#### TC5.2.1: User Can Read Own Invitation
```
Test:
- Login as User B
- Read invitations/[token] where email = User B email
- Expected: SUCCESS
```

#### TC5.2.2: User Cannot Read Others' Invitations
```
Test:
- Login as User B
- Read invitations/[token] where email = different email
- Expected: PERMISSION DENIED
```

#### TC5.2.3: User Cannot Create Invitation Directly
```
Test:
- Login as User B
- Try to create document in invitations/
- Expected: PERMISSION DENIED (only backend)
```

#### TC5.2.4: User Cannot Update Invitation Status
```
Test:
- Login as User B
- Try to update invitations/[token] with status='accepted'
- Expected: PERMISSION DENIED (only backend)
```

---

## Phase 6: Integration Tests

### Test 6.1: End-to-End Existing User Flow
**Complete workflow test**

```
Scenario: Coach invites existing user to group

1. Setup:
   - User A = Coach with permissions
   - User B = Existing user, not in group
   
2. Invitation Creation:
   - User A invites User B via email
   - Verify invitation created in invitations collection
   - Verify notification created in users/[UserB]/notifications
   - Verify User B sees badge increase in real-time
   
3. Notification Display:
   - Login as User B
   - Verify bell shows badge with count
   - Open notification modal
   - Verify invitation notification appears
   - Verify correct icon, title, timestamp
   
4. Invitation Response:
   - Click invitation notification
   - Verify invitation modal opens with correct data
   - Accept invitation
   - Verify success message
   - Verify notification automatically dismissed
   - Verify badge count decreases
   - Verify user added to group
   - Verify membership documents created
   
5. Verification:
   - Check invitations/[token] status = 'accepted'
   - Check users/[UserB]/notifications/[id] dismissed = true
   - Check group membership documents
   - Check User B can access group
```

### Test 6.2: End-to-End New User Flow
**Complete workflow test**

```
Scenario: Coach invites new user who signs up

1. Setup:
   - User A = Coach with permissions
   - User C = Email not in system
   
2. Invitation Creation:
   - User A invites User C via email
   - Verify invitation created with status='pending'
   - Verify NO notification created (user doesn't exist)
   - Verify email sent to User C
   
3. User Signup:
   - User C receives email with invitation link
   - User C clicks link and signs up
   - Verify account created
   - Verify invitation token passed to signup
   
4. Automatic Processing:
   - Backend processes invitation during signup
   - Verify user added to group automatically
   - Verify invitation status = 'accepted'
   - Verify no notification cleanup errors
   
5. Verification:
   - Check invitations/[token] status = 'accepted'
   - Check NO notification exists (wasn't created)
   - Check group membership documents
   - Check User C can access group
   - Login as User C and verify access
```

### Test 6.3: Multiple Invitations
**Test handling multiple invitations**

```
Scenario: User receives multiple invitations

1. Setup:
   - User B not member of 3 different groups
   
2. Create Invitations:
   - Coach A invites User B to Group 1
   - Coach B invites User B to Group 2
   - Coach C invites User B to Group 3
   
3. Verification:
   - User B sees badge with "3"
   - Open modal shows 3 notifications
   - All sorted by timestamp
   
4. Process Invitations:
   - Accept Group 1 invitation
   - Verify notification 1 dismissed
   - Badge shows "2"
   - Reject Group 2 invitation
   - Verify notification 2 dismissed
   - Badge shows "1"
   - Ignore Group 3 invitation
   - Badge still shows "1"
   
5. Final Check:
   - User B member of Group 1 only
   - 1 unread notification remains
   - Can dismiss manually if desired
```

---

## Phase 7: Performance Tests

### Test 7.1: Real-Time Listener Performance
```
Test:
- Subscribe to notifications
- Create 100 notifications rapidly
- Measure callback frequency
- Verify UI remains responsive
- Verify no excessive re-renders
```

### Test 7.2: Large Notification List
```
Test:
- Create 1000 notifications for user
- Open notification modal
- Verify list renders within 2 seconds
- Verify smooth scrolling
- Verify no memory leaks
```

### Test 7.3: Concurrent Users
```
Test:
- Simulate 100 users receiving notifications simultaneously
- Verify all notifications delivered
- Verify no data corruption
- Verify backend functions handle load
```

---

## Phase 8: Edge Cases & Error Handling

### Test 8.1: Offline Behavior
```
Test:
1. Go offline
2. Try to mark notification as read
3. Verify error handling
4. Come back online
5. Verify changes sync automatically
```

### Test 8.2: Deleted User
```
Test:
- Create invitation for User B
- Delete User B account
- Process invitation
- Verify graceful error handling
- Verify no crashes
```

### Test 8.3: Invalid Invitation Token
```
Test:
- Click notification with invalid/expired token
- Verify error message displayed
- Verify notification can be dismissed
```

### Test 8.4: Duplicate Invitation
```
Test:
- User B already member of group
- Try to invite User B again
- Verify appropriate handling
- Verify no duplicate notifications
```

---

## Test Execution Checklist

### Pre-Deployment
- [ ] All backend function tests pass (Phase 1)
- [ ] All service tests pass (Phase 2)
- [ ] All UI component tests pass (Phase 3)
- [ ] All orchestration tests pass (Phase 4)
- [ ] Security rules deployed and tested (Phase 5)

### Post-Deployment
- [ ] End-to-end existing user flow tested (Test 6.1)
- [ ] End-to-end new user flow tested (Test 6.2)
- [ ] Multiple invitations tested (Test 6.3)
- [ ] Performance acceptable (Phase 7)
- [ ] Edge cases handled gracefully (Phase 8)

### Production Monitoring
- [ ] Set up Firebase Analytics for notification events
- [ ] Monitor error rates in Cloud Functions
- [ ] Monitor Firestore read/write costs
- [ ] Monitor notification delivery success rate
- [ ] Set up alerts for failures

---

## Known Limitations & Future Improvements

### Current Limitations
1. Notifications limited to group invitations (v3.0)
2. No push notifications (requires FCM setup)
3. No notification preferences/settings
4. No notification history archive

### Future Enhancements
1. Push notifications via FCM
2. Email digest for unread notifications
3. Notification preferences (mute, frequency)
4. Additional notification types (announcements, events, polls)
5. Rich notifications with actions (accept/reject inline)
6. Notification templates
7. Notification scheduling

---

## Success Criteria

The notification system is considered production-ready when:

- ✅ All Phase 1-5 tests pass with 100% success rate
- ✅ End-to-end flows (6.1, 6.2, 6.3) complete without errors
- ✅ Real-time updates work consistently (<2 second latency)
- ✅ Security rules prevent unauthorized access
- ✅ UI is responsive and intuitive
- ✅ No console errors or warnings
- ✅ Backend functions execute within performance budgets
- ✅ Edge cases handled gracefully with proper error messages

---

## Test Results Log

| Test ID | Description | Status | Date | Notes |
|---------|-------------|--------|------|-------|
| TC1.1.1 | Create notification - group invitation | ⏳ | - | - |
| TC1.1.2 | Create notification - invalid user | ⏳ | - | - |
| TC1.2.1 | Send invitation - existing user | ⏳ | - | - |
| TC1.2.2 | Send invitation - new user | ⏳ | - | - |
| TC2.1.1 | Real-time subscription - initial load | ⏳ | - | - |
| TC2.1.2 | Real-time subscription - live update | ⏳ | - | - |
| TC3.1.1 | NotificationBell - badge display | ⏳ | - | - |
| TC3.1.6 | NotificationBell - invitation click | ⏳ | - | - |
| TC4.1.1 | Accept invitation with cleanup | ⏳ | - | - |
| TC4.1.2 | Reject invitation with cleanup | ⏳ | - | - |
| TC5.1.1 | Security - read own notifications | ⏳ | - | - |
| TC5.1.3 | Security - cannot create directly | ⏳ | - | - |
| TC6.1 | E2E existing user flow | ⏳ | - | - |
| TC6.2 | E2E new user flow | ⏳ | - | - |

Legend: ⏳ Pending | ✅ Pass | ❌ Fail | 🔄 In Progress

---

**Document Version:** 1.0  
**Last Updated:** January 12, 2026  
**Author:** Development Team  
**Status:** Ready for Testing
