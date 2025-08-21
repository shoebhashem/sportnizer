#!/bin/bash

# Sportnizer Firebase Functions Deployment Script

echo "🚀 Deploying Sportnizer Firebase Functions..."

# Set environment variables (you need to do this once)
echo "📧 Setting up SMTP environment variables..."
echo "Please run these commands with your actual credentials:"
echo "firebase functions:config:set smtp.user=\"noreply@sportnizer.com\""
echo "firebase functions:config:set smtp.password=\"Kalankar9!\""
echo ""

# Build and deploy functions
echo "🔨 Building and deploying functions..."
cd functions
npm run build
cd ..
firebase deploy --only functions

echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Set your SMTP password using the commands above"
echo "2. Test the email functionality from the app"
echo "3. Check Firebase Console for any function logs"
