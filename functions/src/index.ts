/**
 * Sportnizer Firebase Functions
 * Handles email invitations and other server-side operations
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { setGlobalOptions } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import * as nodemailer from "nodemailer";

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// For cost control and EU region, set global options
setGlobalOptions({ 
  maxInstances: 10,
  region: "europe-north1" // Finland - closest to Sweden
});

// Configure SMTP transporter
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp.strato.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER, // noreply@sportnizer.com
      pass: process.env.SMTP_PASSWORD, // Your email password
    },
  });
};

interface InvitationData {
  email: string;
  groupId: string;
  groupName: string;
  inviterName: string;
}

export const sendGroupInvitation = onCall<InvitationData>(async (request) => {
  try {
    // Verify user is authenticated
    if (!request.auth) {
      throw new Error("User must be authenticated");
    }

    const { email, groupId, groupName, inviterName } = request.data;
    
    // Validate input
    if (!email || !groupId || !groupName) {
      throw new Error("Missing required fields");
    }

    // Generate unique invitation token
    const invitationToken = crypto.randomUUID();
    
    // Store invitation in Firestore
    await db.collection('invitations').doc(invitationToken).set({
      groupId: groupId,
      groupName: groupName,
      invitedEmail: email,
      invitedBy: request.auth.uid,
      inviterName: inviterName,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // Create invitation link - using localhost for development, production domain for live
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const baseUrl = isDevelopment ? 'http://localhost:8081' : 'https://app.sportnizer.com';
    const invitationLink = `${baseUrl}/signup?invite=${invitationToken}`;
    
    // Create email transporter
    const transporter = createEmailTransporter();
    
    // Email template
    const mailOptions = {
      from: '"Sportnizer" <noreply@sportnizer.com>',
      to: email,
      subject: `You're invited to join "${groupName}" on Sportnizer!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #25292e;">You're Invited to Join a Sports Group!</h2>
          
          <p>Hi there!</p>
          
          <p><strong>${inviterName}</strong> has invited you to join the <strong>"${groupName}"</strong> group on Sportnizer.</p>
          
          <p>Sportnizer helps sports teams organize events, track statistics, and stay connected.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${invitationLink}" 
               style="background-color: #ffd33d; color: #25292e; padding: 15px 30px; 
                      text-decoration: none; border-radius: 8px; font-weight: bold; 
                      display: inline-block;">
              Join "${groupName}"
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            ${isDevelopment ? 
              '<strong>Development Note:</strong> This invitation will expire in 7 days. Click the button above to open the app in your browser at localhost:8081.' :
              'This invitation will expire in 7 days. If you already have a Sportnizer account, you can also accept this invitation by logging into the app.'
            }
          </p>
          
          ${isDevelopment ? '' : `
          <p style="color: #666; font-size: 14px;">
            If you already have a Sportnizer account, you can also accept this invitation by logging into the app.
          </p>
          `}
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px;">
            This email was sent by Sportnizer${isDevelopment ? ' (Development Environment)' : ''}. 
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);
    
    logger.info(`Invitation sent successfully to ${email} for group ${groupName}`);
    
    return { 
      success: true, 
      message: `Invitation sent to ${email}`,
      invitationToken 
    };
    
  } catch (error) {
    logger.error('Error sending invitation:', error);
    throw new Error(`Failed to send invitation: ${error}`);
  }
});
