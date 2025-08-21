# Email Invitation Setup Guide

## Overview
The Sportnizer app now has a complete email invitation system that sends professional emails from `noreply@sportnizer.com` when users invite others to join their sports groups.

## Setup Steps

### 1. Configure SMTP Credentials
Set up your email credentials in Firebase Functions configuration:

```bash
# Navigate to your project root
cd /Users/shoebhashem/Projects/sportnizer/sportnizer

# Set SMTP credentials (replace with actual password)
firebase functions:config:set smtp.user="noreply@sportnizer.com"
firebase functions:config:set smtp.password="your_actual_strato_password"

# Verify configuration
firebase functions:config:get
```

### 2. Deploy Firebase Functions
Run the deployment script:

```bash
./deploy-functions.sh
```

Or manually:
```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

### 3. Test Email Functionality (Development)
1. Start your Expo development server: `npx expo start`
2. Open the app in your browser at `http://localhost:8081`
3. Go to Manage Teams → Select a group → Add Members
4. Enter an email address that doesn't have a Sportnizer account
5. The system will offer to send an invitation email
6. Check that the email is received with a localhost:8081 link for testing

**Note:** Invitation links will automatically point to `localhost:8081` during development and `app.sportnizer.com` in production.

## How It Works

### Frontend (Add Members Screen)
- **Real User Search**: Searches Firestore `users` collection by email and display name
- **Member Validation**: Checks if users are already group members
- **Email Validation**: Detects valid email addresses for invitation
- **Firebase Function Integration**: Calls `sendGroupInvitation` function for email sending

### Backend (Firebase Functions)
- **Authentication**: Verifies user is logged in before sending invitations
- **Invitation Tracking**: Stores invitation tokens in Firestore with expiration
- **Email Templates**: Professional HTML emails with Sportnizer branding
- **SMTP Integration**: Uses Strato.com SMTP with custom domain

### Email Features
- **Professional Sender**: Emails from "Sportnizer" <noreply@sportnizer.com>
- **Branded Template**: Yellow/black Sportnizer theme with call-to-action button
- **Invitation Links**: Direct links to app.sportnizer.com with invitation tokens
- **Expiration**: 7-day expiration for security

## File Structure
```
app/addmembers.tsx          # Frontend invitation interface
services/firebase.ts         # Firebase configuration with Functions
functions/src/index.ts       # Email sending function
functions/.env.example       # SMTP credentials template
deploy-functions.sh          # Deployment script
```

## Development Features

### Smart Environment Detection
The email system automatically detects the environment:
- **Development**: Links point to `http://localhost:8081`
- **Production**: Links point to `https://app.sportnizer.com`

### Development Email Template
- Includes "Development Environment" note in footer
- Special development note about localhost links
- Maintains professional branding for testing

### Testing Workflow
1. Start Expo: `npx expo start`
2. Open browser at `localhost:8081`
3. Send test invitations
4. Click invitation links to test the flow

## Environment Variables
```
SMTP_USER=noreply@sportnizer.com
SMTP_PASSWORD=your_strato_password
```

## Testing Checklist
- [ ] SMTP credentials configured in Firebase Functions
- [ ] Functions deployed successfully
- [ ] User search returns real Firestore users
- [ ] Email invitations sent to non-users
- [ ] Invitation emails received with correct branding
- [ ] Invitation links work (when signup flow is implemented)

## Next Steps
1. Implement invitation token handling in signup flow
2. Add invitation acceptance logic
3. Test end-to-end invitation process
4. Monitor email delivery rates in Firebase Console
