import * as nodemailer from 'nodemailer';
import { config } from './config';

// Initialize Nodemailer transporter
export const emailTransporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

/**
 * Email template for group invitations
 */
export const groupInvitationTemplate = (
  groupName: string,
  inviterName: string,
  invitationLink: string
) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #333;">You're invited to join ${groupName}!</h2>
    <p>Hi there,</p>
    <p><strong>${inviterName}</strong> has invited you to join <strong>${groupName}</strong> on Sportnizer.</p>
    <p>Sportnizer helps you manage your sports groups, track events, and stay connected with your teammates.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${invitationLink}" style="background-color: #007AFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Join ${groupName}</a>
    </div>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #666;">${invitationLink}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #888; font-size: 12px;">This invitation was sent by ${inviterName}. If you didn't expect this invitation, you can safely ignore this email.</p>
  </div>
`;

/**
 * Email template for email verification
 */
export const emailVerificationTemplate = (
  fullName: string,
  verificationLink: string,
  isResend = false
) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #007AFF; margin: 0; font-size: 28px;">Sportnizer</h1>
    </div>
    
    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
      <h2 style="color: #333; margin-bottom: 20px;">${isResend ? 'Verify Your Email - Resent' : `Welcome ${fullName}!`}</h2>
      
      <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
        ${isResend 
          ? 'You requested a new verification email for your Sportnizer account. Please click the button below to verify your email address and activate your account.'
          : 'Thank you for signing up for Sportnizer! To complete your registration and start using the app, please verify your email address by clicking the button below.'
        }
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}" 
           style="background-color: #007AFF; color: white; padding: 15px 30px; text-decoration: none; 
                  border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
          Verify Your Email
        </a>
      </div>
      
      <p style="color: #999; font-size: 14px; margin-top: 25px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${verificationLink}" style="color: #007AFF; word-break: break-all;">${verificationLink}</a>
      </p>
      
      <p style="color: #999; font-size: 12px; margin-top: 25px;">
        This verification link will expire in 24 hours. ${isResend ? 'If you didn\'t request this email, please ignore it.' : 'If you didn\'t create an account with Sportnizer, please ignore this email.'}
      </p>
    </div>
    
    <div style="text-align: center; margin-top: 20px;">
      <p style="color: #999; font-size: 12px;">© 2025 Sportnizer. All rights reserved.</p>
    </div>
  </div>
`;

/**
 * Email template for guardian invitations
 */
export const guardianInvitationTemplate = (
  memberName: string,
  groupName: string,
  inviterName: string,
  invitationLink: string
) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #007AFF; margin: 0; font-size: 28px;">Sportnizer</h1>
    </div>
    
    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
      <h2 style="color: #333; margin-bottom: 20px;">Guardian Confirmation Required</h2>
      
      <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
        <strong>${inviterName}</strong> has added <strong>${memberName}</strong> to the group <strong>${groupName}</strong> and needs your confirmation as their guardian.
      </p>
      
      <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
        Sportnizer helps sports groups manage events, track attendance, and stay connected. As ${memberName}'s guardian, you'll be able to:
      </p>
      
      <ul style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
        <li>Receive event invitations on behalf of ${memberName}</li>
        <li>Accept or decline participation in activities</li>
        <li>Stay updated with group announcements</li>
        <li>View ${memberName}'s schedule and activities</li>
      </ul>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${invitationLink}" style="background-color: #007AFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
          Confirm ${memberName}'s Participation
        </a>
      </div>
      
      <p style="color: #999; font-size: 14px; margin-top: 25px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${invitationLink}" style="color: #007AFF; word-break: break-all;">${invitationLink}</a>
      </p>
      
      <p style="color: #999; font-size: 12px; margin-top: 25px;">
        This invitation will expire in 14 days. If you don't recognize this group or child, you can safely ignore this email.
      </p>
    </div>
    
    <div style="text-align: center; margin-top: 20px;">
      <p style="color: #999; font-size: 12px;">© 2025 Sportnizer. All rights reserved.</p>
    </div>
  </div>
`;
