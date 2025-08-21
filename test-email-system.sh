#!/bin/bash

# Test Email Invitation System

echo "🧪 Testing Sportnizer Email Invitation System"
echo ""

# Check if Expo is running
if ! curl -s http://localhost:8081 > /dev/null 2>&1; then
    echo "❌ Expo dev server not running at localhost:8081"
    echo "Please start it with: npx expo start"
    exit 1
fi

echo "✅ Expo dev server is running at localhost:8081"
echo ""

# Check if Firebase Functions are deployed
echo "📧 Testing Firebase Functions deployment..."
firebase functions:config:get

echo ""
echo "🔗 Invitation links will point to: http://localhost:8081/signup?invite=[token]"
echo ""
echo "📝 To test the complete flow:"
echo "1. Open http://localhost:8081 in your browser"
echo "2. Navigate to Manage Teams → Add Members"
echo "3. Enter a test email address"
echo "4. Send invitation and check your email"
echo "5. Click the invitation link to test the signup flow"
