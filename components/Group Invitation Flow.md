📘 Invitation Flow — Architecture & Data Lifecycle Documentation
Overview

This document describes how the group invitation flow works across the frontend (Expo React App) and backend (Firebase Cloud Functions).
It explains the data flow, Firestore updates, and how the invitation token is created, validated, and consumed.

The flow ensures that:

Invitations can be sent by admins via email.

Invited users can accept or reject invitations.

Firestore updates occur consistently across:

/clubs/{clubId}/allMembers/members

/clubs/{clubId}/groups/{groupId}/allMembers/members

/users/{uid}/clubs

/users/{uid}/groupsJoined

sequenceDiagram
    participant Admin as Admin (Frontend)
    participant CF1 as sendGroupInvitation (Cloud Function)
    participant Email as Email Service (Nodemailer)
    participant User as Invited User (Frontend)
    participant CF2 as processInvitation (Cloud Function)
    participant Auth as Firebase Auth
    participant Firestore as Firestore DB
    participant CF3 as respondToInvitation (Cloud Function)

    Admin->>CF1: Call sendGroupInvitation({emails[], clubId, groupId, ...})
    CF1->>Firestore: Create /invitations/{token} doc (status: pending)
    CF1->>Email: Send email link (baseUrl/login?invite={token})
    Email->>User: Receives invitation email

    User->>User: Clicks link → opens app /login?invite={token}
    User->>CF2: POST /processInvitation({token})
    CF2->>Firestore: Verify /invitations/{token}
    CF2-->>User: Return invitation info (groupName, inviterName, etc.)

    User->>Auth: Sign in / Sign up (Firebase Auth)
    Auth-->>Firestore: Create /users/{uid} (on signup)
    User->>CF3: POST /respondToInvitation({
        invitationToken,
        uid,
        action: 'accept'
    })

    CF3->>Firestore: Fetch /invitations/{token}
    CF3->>Firestore: Fetch /users/{uid}
    CF3->>Firestore: Validate invitation + user record

    CF3->>Firestore: Add user to:
        - /clubs/{clubId}/allMembers/members
        - /clubs/{clubId}/groups/{groupId}/allMembers/members
    CF3->>Firestore: Update /users/{uid}/
        - clubs[] += {clubId, role, joinedAt, ...}
        - groupsJoined[] += {groupId, groupName, joinedAt, ...}
    CF3->>Firestore: Update /invitations/{token} (status: accepted)
    CF3-->>User: Success message ("You’ve joined Group X!")

    CF3-->>Firestore: Delete invitation doc after short delay


🧭 Functional Breakdown
1. sendGroupInvitation (Cloud Function — Callable)

Purpose:
Triggered when an admin invites new members to a group.
Creates the invitation document and emails the invite link.

Inputs:

{
  "emails": ["user@example.com"],
  "clubId": "club123",
  "groupId": "group456",
  "groupName": "Gothenburg FC",
  "inviterName": "Shoeb Hashem"
}


Key Operations:

Validate inputs and admin authentication.

Generate a unique token → invitations/{token}.

Write invitation data to Firestore:

invitations/{token}:
  email
  clubId
  groupId
  groupName
  inviterName
  inviterUid
  createdAt
  used: false
  status: "pending"


Send email with link:

{baseUrl}/login?invite={token}

2. processInvitation (Cloud Function — onRequest)

Purpose:
Triggered when the invited user clicks the invitation link.
Validates the token and returns the invitation details to the frontend.

Inputs:

{
  "invitationToken": "abc123xyz"
}


Key Operations:

Validate request and check Firestore invitations/{token}.

Ensure invitation exists, is not expired, and not used.

Return details such as:

{
  "success": true,
  "groupName": "Gothenburg FC",
  "inviterName": "Shoeb Hashem",
  "clubId": "club123",
  "groupId": "group456",
  "status": "pending"
}


Frontend Behavior:

App reads invite from URL params.

Calls this function.

Displays “You’ve been invited to join Gothenburg FC by Shoeb Hashem. Please sign in to continue.”

3. respondToInvitation (Cloud Function — onRequest)

Purpose:
Triggered when a logged-in user accepts or rejects the invitation.
Updates Firestore membership and user profile accordingly.

Inputs:

{
  "invitationToken": "abc123xyz",
  "userEmail": "user@example.com",
  "action": "accept"
}


Key Operations:

Validate token, user, and action.

Retrieve invitation details from Firestore.

Find corresponding group and club.

If action = 'accept':

Add new user entry to:

/clubs/{clubId}/allMembers/members
/clubs/{clubId}/groups/{groupId}/allMembers/members


Each new entry follows the predefined Member interface (name, email, uid, roles, joinedAt, etc.).

Update user document /users/{uid}:

clubs[] += {
  clubId,
  role: "member",
  joinedAt,
  ...
}

groupsJoined[] += {
  groupId,
  groupName,
  clubId,
  role: "member",
  joinedAt,
  ...
}


Mark invitation as used:

used: true
status: "accepted"
usedAt: serverTimestamp()
usedBy: uid


Schedule deletion of the invitation document after a short delay.

If action = 'reject':

Update invitation:

used: true
status: "rejected"
usedAt: serverTimestamp()
usedBy: uid


Delete invitation after delay.

🔄 Invitation Token Lifecycle
Stage	Function	Firestore State	Description
Created	sendGroupInvitation	status: pending, used: false	Token created and emailed.
Viewed	processInvitation	No DB changes	Token verified, details shown to user.
Accepted	respondToInvitation	status: accepted, used: true	User added to club/group, token marked used.
Rejected	respondToInvitation	status: rejected, used: true	Invitation declined, cleaned up.
Expired	(future)	status: expired	Automatically marked expired after a TTL (optional).
💻 Frontend Responsibilities (Expo React App)
1. Handle Deep Linking / URL Params
const token = new URLSearchParams(window.location.search).get('invite');


Store this token (e.g., in AsyncStorage or React Context) until the user signs in.

2. Call processInvitation

When the app loads with invite param, call /processInvitation.

Display group and inviter details to the user.

3. Authenticate User

If user not logged in → prompt Firebase Auth login/signup.

On signup, /users/{uid} is automatically created.

4. Call respondToInvitation

After login, if an invite token exists:

await fetch(`${API_URL}/respondToInvitation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    invitationToken: token,
    userEmail: user.email,
    action: 'accept'
  })
});

5. Handle Response

On success → show “You’ve joined {groupName}!”

On error → show proper message (expired, invalid, already used).

🧠 Firestore Data Update Summary
Collection Path	Action	Description
/invitations/{token}	Create → Update → Delete	Lifecycle management of invitations
/clubs/{clubId}/allMembers/members	Add user entry	Adds member to club-level members list
/clubs/{clubId}/groups/{groupId}/allMembers/members	Add user entry	Adds member to specific group
/users/{uid}/clubs	Append	Tracks which clubs the user belongs to
/users/{uid}/groupsJoined	Append	Tracks which groups the user joined
✅ Future Improvements

Add an expiration mechanism for invitations (e.g., 7 days).

Support shareable invitations (reusable tokens).

Add transaction-based writes for atomic updates across club/group/user.

🧾 Summary

This design ensures a complete and reliable invitation flow across frontend (Expo React app) and backend (Firebase Cloud Functions).

Stage	Function	Frontend Action	Firestore Updates
Invite creation	sendGroupInvitation	Admin sends invite	invitations/{token} created
Invite validation	processInvitation	User opens link	None (read-only)
Invite response	respondToInvitation	User accepts/rejects	Users + Clubs + Groups updated