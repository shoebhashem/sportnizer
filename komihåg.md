Phase 2 — Production Launch Prep (plan now, implement after testing)
Once your 14 days are done and you're preparing for public launch, then implement the smart routing:

Add Android App Links to app.json — configure intentFilters so https://app.clubnizer.com/invitation/* opens the native app automatically when installed
Host .well-known/assetlinks.json on your Netlify site for Android verification
Add a "smart app banner" on the web invitation pages — when a mobile user lands on the web version, show a banner: "Open in Clubnizer" / "Get it on Google Play". This is a small UI addition to accept.tsx and reject.tsx using Platform.OS === "web" + user-agent sniffing
Store the Play Store URL in your backend config (config.ts) so it's easily switchable — but honestly, once you're publicly launched, the URL is permanent
This Phase 2 work is ~2-4 hours of implementation when the time comes, and it gives you exactly what ChatGPT described but without over-engineering it for 12 testers.
