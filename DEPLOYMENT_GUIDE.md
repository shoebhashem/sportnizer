# Notification System Deployment Guide

## Overview
This guide covers deploying the Version 3.0 dual-storage notification system to Firebase.

---

## Prerequisites

- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] Firebase project configured
- [ ] Firebase Admin SDK credentials configured
- [ ] Node.js 18+ installed

---

## Deployment Steps

### Step 1: Deploy Firestore Security Rules

```bash
# Navigate to project root
cd /path/to/sportnizer

# Deploy security rules
firebase deploy --only firestore:rules

# Verify deployment
firebase firestore:rules get
```

**Verification:**
- Check Firebase Console → Firestore → Rules
- Verify rules version matches local file
- Check for syntax errors in console

### Step 2: Deploy Firebase Functions

```bash
# Navigate to functions directory
cd functions

# Install dependencies (if not already)
npm install

# Build TypeScript
npm run build

# Deploy all functions
firebase deploy --only functions

# Or deploy specific functions
firebase deploy --only functions:createNotification
firebase deploy --only functions:sendGroupInvitation
```

**Verification:**
- Check Firebase Console → Functions
- Verify all functions deployed successfully
- Check function logs for errors
- Test functions via Firebase console or API

**New/Updated Functions:**
- `createNotification` - NEW
- `sendGroupInvitation` - UPDATED
- All other functions should remain unchanged

### Step 3: Deploy Web App

```bash
# Navigate to project root
cd /path/to/sportnizer

# Install dependencies
npm install

# Build for production
npm run build

# Test locally first (optional)
npm start

# Deploy (if using Firebase Hosting)
firebase deploy --only hosting
```

**Verification:**
- Test notification bell appears in header
- Test creating an invitation
- Verify real-time updates work
- Check browser console for errors

---

## Post-Deployment Verification

### 1. Test Notification Creation

**Via Firebase Console:**
1. Go to Functions → `createNotification`
2. Test with payload:
```json
{
  "userId": "test_user_id",
  "type": "group_invitation",
  "title": "Test Invitation",
  "body": "This is a test notification",
  "data": {
    "invitationToken": "test_token_123",
    "clubId": "test_club",
    "groupId": "test_group"
  }
}
```
3. Check Firestore for created notification

### 2. Test Existing User Invitation Flow

1. Login as coach/admin
2. Invite existing user to group
3. Verify:
   - Invitation document created in `invitations/`
   - Notification document created in `users/{userId}/notifications/`
   - User sees notification bell badge update
   - Email NOT sent (in-app notification only)

### 3. Test New User Invitation Flow

1. Login as coach/admin
2. Invite email not in system
3. Verify:
   - Invitation document created in `invitations/`
   - NO notification document (user doesn't exist)
   - Email sent to new user
   - Check email logs

### 4. Test Notification UI

1. Login as user with notifications
2. Verify:
   - Bell icon shows badge count
   - Clicking bell opens modal
   - Notifications display correctly
   - Mark as read works
   - Dismiss works
   - "Mark all read" works

### 5. Test Invitation Response

1. Accept/reject invitation
2. Verify:
   - Invitation status updated
   - Notification automatically dismissed
   - User added/not added to group
   - Badge count updates

### 6. Test Security Rules

**Using Firebase Emulator or Console:**

1. User can read own notifications ✅
2. User cannot read others' notifications ❌
3. User cannot create notifications directly ❌
4. User can update read/dismissed fields ✅
5. User cannot update other fields ❌
6. User can read invitations sent to their email ✅
7. User cannot create invitations directly ❌

---

## Rollback Plan

If issues occur after deployment:

### Rollback Functions
```bash
# List previous deployments
firebase functions:log

# Rollback to previous version
firebase rollback functions
```

### Rollback Security Rules
```bash
# Get previous rules from git
git checkout HEAD~1 firestore.rules

# Deploy previous rules
firebase deploy --only firestore:rules
```

### Rollback Web App
```bash
# Deploy previous version from git
git checkout HEAD~1
npm run build
firebase deploy --only hosting
```

---

## Monitoring

### Set Up Alerts

1. **Firebase Console → Functions → Logs**
   - Monitor for errors in `createNotification`
   - Monitor for errors in `sendGroupInvitation`

2. **Firebase Console → Firestore → Usage**
   - Monitor read/write counts
   - Check for unexpected spikes
   - Verify costs are within budget

3. **Firebase Console → Analytics**
   - Track notification creation events
   - Track notification read/dismiss events
   - Monitor user engagement

### Key Metrics to Monitor

- Notification creation success rate (target: >99%)
- Average notification delivery time (target: <2 seconds)
- Notification read rate (target: >70%)
- Invitation acceptance rate
- Function execution time (target: <5 seconds)
- Firestore read/write costs

---

## Troubleshooting

### Issue: Notifications not appearing

**Possible causes:**
1. Security rules blocking access
2. User not authenticated
3. Real-time listener not set up
4. Function deployment failed

**Debug steps:**
```bash
# Check function logs
firebase functions:log --only createNotification

# Check Firestore security rules
firebase firestore:rules get

# Check browser console for errors
# Open DevTools → Console → Check for errors
```

### Issue: Badge count incorrect

**Possible causes:**
1. Dismissed notifications still counted
2. Real-time listener not updating
3. Multiple subscriptions

**Debug steps:**
- Check Firestore query filters
- Verify `dismissed: false` in query
- Check for duplicate subscriptions
- Verify unsubscribe called on unmount

### Issue: Security rules denying access

**Debug steps:**
```bash
# Test rules in Firebase Console
# Go to Firestore → Rules → Rules Playground
# Test specific operations

# Check user authentication
console.log(firebase.auth().currentUser)

# Check notification ownership
# Verify userId matches authenticated user
```

### Issue: High Firestore costs

**Possible causes:**
1. Too many real-time listeners
2. Inefficient queries
3. Not cleaning up listeners

**Solutions:**
- Implement pagination for notification list
- Limit real-time listener scope
- Ensure listeners unsubscribe on unmount
- Consider caching frequently accessed data

---

## Environment-Specific Configuration

### Development
```bash
# Use Firebase emulators
firebase emulators:start

# Test locally with emulators
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
```

### Staging
```bash
# Deploy to staging project
firebase use staging
firebase deploy
```

### Production
```bash
# Deploy to production project
firebase use production

# Deploy with confirmation
firebase deploy --only functions,firestore:rules,hosting

# Monitor closely after deployment
firebase functions:log --limit 100
```

---

## Performance Optimization

### Client-Side
1. Implement notification list pagination
2. Use React.memo for notification items
3. Debounce real-time updates
4. Implement virtual scrolling for large lists

### Server-Side
1. Batch notification creation when possible
2. Use transaction for dual-writes
3. Implement retry logic for failed operations
4. Cache frequently accessed data

---

## Security Checklist

- [ ] Firestore security rules deployed and tested
- [ ] Backend functions require authentication
- [ ] Input validation on all functions
- [ ] Rate limiting configured (via Cloud Functions)
- [ ] Sensitive data not exposed in client
- [ ] User can only access own notifications
- [ ] Backend-only operations protected (create notification)
- [ ] Invitation tokens cryptographically secure

---

## Success Criteria

Deployment is successful when:

- ✅ All functions deployed without errors
- ✅ Security rules deployed and tested
- ✅ Web app deployed and accessible
- ✅ Existing user flow works end-to-end
- ✅ New user flow works end-to-end
- ✅ Real-time updates working (<2 sec latency)
- ✅ No console errors or warnings
- ✅ Security rules tested and verified
- ✅ Monitoring and alerts configured
- ✅ No performance degradation

---

## Post-Deployment Tasks

### Immediate (Day 1)
- [ ] Monitor function logs for errors
- [ ] Check Firestore usage metrics
- [ ] Test with real users
- [ ] Verify email delivery for new users
- [ ] Check notification badge updates

### Short-term (Week 1)
- [ ] Analyze notification engagement metrics
- [ ] Gather user feedback
- [ ] Optimize based on usage patterns
- [ ] Address any reported issues
- [ ] Fine-tune security rules if needed

### Long-term (Month 1)
- [ ] Review Firestore costs and optimize
- [ ] Implement additional notification types
- [ ] Add push notifications (FCM)
- [ ] Implement notification preferences
- [ ] Archive old notifications

---

## Contact & Support

For issues or questions:
- Check logs: `firebase functions:log`
- Firebase Console: https://console.firebase.google.com
- Project documentation: `ARCHITECTURE.md`
- Test plan: `NOTIFICATION_SYSTEM_TEST_PLAN.md`

---

**Document Version:** 1.0  
**Last Updated:** January 12, 2026  
**Deployment Status:** Ready for Production
