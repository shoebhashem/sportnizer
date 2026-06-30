Phase 2 — Production Launch Prep (plan now, implement after testing)
Once your 14 days are done and you're preparing for public launch, then implement the smart routing:

Add Android App Links to app.json — configure intentFilters so https://app.clubnizer.com/invitation/* opens the native app automatically when installed
Host .well-known/assetlinks.json on your Netlify site for Android verification
Add a "smart app banner" on the web invitation pages — when a mobile user lands on the web version, show a banner: "Open in Clubnizer" / "Get it on Google Play". This is a small UI addition to accept.tsx and reject.tsx using Platform.OS === "web" + user-agent sniffing
Store the Play Store URL in your backend config (config.ts) so it's easily switchable — but honestly, once you're publicly launched, the URL is permanent
This Phase 2 work is ~2-4 hours of implementation when the time comes, and it gives you exactly what ChatGPT described but without over-engineering it for 12 testers.





Read content.txt, lines 1 to 300

Here is the complete picture of the fee system:

Fee System — Full Investigation
What happens when a fee is created
When a club admin creates a fee, three things happen per recipient:

Channel	Sent?	Notes
In-app notification	✅ Yes	type: "payment_request", high priority, written to users/{uid}/notifications/
Push notification	✅ Yes	Expo push via users/{uid}/pushTokens, Android channel "payments", high priority
Email	❌ No	Nothing is sent. Not to players, coaches, or guardians. Zero email support for fees.
Guardian routing is implemented for in-app + push only. Youth members (needsGuardian: true) cause the notification to go to each guardian.guardianUid instead of the youth directly. But no email is sent to the guardian either.

Due Date
Yes — fully implemented, end-to-end:

The create-membership-fee.tsx screen has a date picker UI (labelled dueDateOptional — it is optional)
The backend stores dueDate: Timestamp | null on the fee document and on each member's embedded paymentStatus
getUserPendingPayments computes isOverdue and daysRemaining at query time
PaymentCard shows a red/warning style when overdue or ≤ 7 days remaining, with "Pay Now (Overdue)" label
Reminder System
None exists. This is a significant gap:

No scheduled Cloud Function checks approaching/past due dates and re-notifies
No Firestore trigger fires when dueDate is crossed
No isOverdue flag ever causes a new notification or email
The three scheduled jobs that exist are for cleanup only (cleanupDeletedEntities, cleanupOldEvents, cleanupOldStatistics) — none related to payments
No reminder-related fields exist on the fee document (reminderSent, reminderAt, etc.)
The isOverdue / daysRemaining values that getUserPendingPayments computes are read-only UI signals — nothing acts on them.

Possibility of Adding Automatic Reminders
The system is well-positioned to add this, because:

All the data needed already exists: dueDate, status: "pending", includedMembers[], paymentStatus.activeFeeId, push tokens in users/{uid}/pushTokens
The scheduled function infrastructure already exists (onSchedule in europe-west1) — a new job could query all active fees with dueDate within N days and send push + in-app + email reminders
The opt-in field would just need to be added to the fee document (e.g. sendReminder: boolean, reminderDaysBefore: number) and respected by the scheduled job
Email infrastructure exists (emailTransporter + template system in utils/email.ts) — only a payment/reminder email template needs to be added
Summary of Gaps
Feature	Status
Push notification on fee creation	✅ Works, guardian-routed
In-app notification on fee creation	✅ Works, guardian-routed
Email on fee creation	❌ Missing entirely
Due date field	✅ Full (optional, stored, used for UI)
Overdue detection	✅ Computed at read time (isOverdue, daysRemaining)
Automatic reminders	❌ Missing entirely
Reminder opt-in option for admin	❌ Missing (no field on fee document)
Email reminders near/past deadline	❌ Missing entirely
The two biggest gaps are: (1) no email at all for fee creation, and (2) no reminder system. Both are architecturally very straightforward to add given what already exists.
