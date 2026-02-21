import * as nodemailer from "nodemailer";
import { config } from "./config";

// =======================================================
// BRAND CONFIG (Aligned With App Theme)
// =======================================================
const BRAND = {
  primaryDark: "#25292e",
  accent: "#ffcb3deb",
  white: "#ffffff",
  textDark: "#333333",
  textLight: "#666666",
  border: "#e0e0e0",
  error: "#ff4444",
};

// =======================================================
// FIREBASE STORAGE LOGO URL
// =======================================================
const LOGO_URL =
  "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fsportnizer_logo.png?alt=media";

// =======================================================
// REUSABLE HEADER
// =======================================================
const emailHeader = (subtitle?: string) => `
  <div style="
    background-color: ${BRAND.primaryDark};
    padding: 30px;
    text-align: center;
    border-radius: 12px 12px 0 0;
  ">
    <img 
      src="${LOGO_URL}"
      alt="Sportnizer Logo"
      width="60"
      style="display:block; margin: 0 auto 12px auto;"
    />

    <h1 style="
      color: ${BRAND.accent};
      margin: 0;
      font-size: 28px;
      font-weight: 600;
      letter-spacing: 0.5px;
    ">
      Sportnizer
    </h1>

    ${
      subtitle
        ? `<p style="color: ${BRAND.white}; margin: 6px 0 0; font-size: 15px;">
            ${subtitle}
           </p>`
        : ""
    }
  </div>
`;

// =======================================================
// REUSABLE BUTTON
// =======================================================
const primaryButton = (label: string, link: string) => `
  <div style="text-align: center; margin: 35px 0;">
    <a href="${link}"
       style="
         background-color: ${BRAND.accent};
         color: ${BRAND.primaryDark};
         padding: 14px 32px;
         text-decoration: none;
         border-radius: 9999px;
         display: inline-block;
         font-weight: 600;
         font-size: 16px;
         min-width: 180px;
       ">
       ${label}
    </a>
  </div>
`;

// =======================================================
// BASE WRAPPER
// =======================================================
const emailWrapper = (content: string) => `
  <div style="
    font-family: Arial, sans-serif;
    max-width: 600px;
    margin: 40px auto;
    background-color: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.08);
    overflow: hidden;
  ">
    ${content}
  </div>
`;

// =======================================================
// EMAIL TRANSPORTER
// =======================================================
export const emailTransporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

// =======================================================
// GROUP INVITATION
// =======================================================
export const groupInvitationTemplate = (
  groupName: string,
  inviterName: string,
  invitationLink: string,
) =>
  emailWrapper(`
    ${emailHeader("Join your sports community")}

    <div style="padding: 40px 30px;">
      <h2 style="color:${BRAND.textDark}; text-align:center; margin-top:0;">
        You're invited to join ${groupName}!
      </h2>

      <p style="color:${BRAND.textLight}; font-size:16px; line-height:1.6;">
        <strong>${inviterName}</strong> has invited you to join 
        <strong style="color:${BRAND.accent};">${groupName}</strong>.
      </p>

      ${primaryButton(`Join ${groupName}`, invitationLink)}

      <p style="font-size:14px; color:#999;">
        If the button doesn't work, copy this link:<br>
        <a href="${invitationLink}" style="color:${BRAND.accent}; word-break: break-all;">
          ${invitationLink}
        </a>
      </p>
    </div>
  `);

// =======================================================
// GROUP INVITATION WITH ACTIONS (FIXED - REQUIRED EXPORT)
// =======================================================
export const groupInvitationWithActionsTemplate = (
  groupName: string,
  clubName: string,
  inviterName: string,
  acceptLink: string,
  rejectLink: string,
) =>
  emailWrapper(`
    ${emailHeader("You're Invited!")}

    <div style="padding: 40px 30px;">
      <h2 style="color:${BRAND.textDark}; margin-top:0;">
        Join ${groupName}
      </h2>

      <p style="color:${BRAND.textLight}; font-size:16px; line-height:1.6;">
        <strong>${inviterName}</strong> invited you to join 
        <strong style="color:${BRAND.accent};">${groupName}</strong> 
        in ${clubName}.
      </p>

      ${primaryButton("Accept Invitation", acceptLink)}

      <div style="text-align:center; margin-top:15px;">
        <a href="${rejectLink}" style="
          color:${BRAND.error};
          font-size:14px;
          text-decoration:none;
        ">
          Decline Invitation
        </a>
      </div>
    </div>
  `);

// =======================================================
// CLUB ADMIN INVITATION
// =======================================================
export const clubAdminInvitationTemplate = (
  clubName: string,
  inviterName: string,
  acceptLink: string,
  rejectLink: string,
) =>
  emailWrapper(`
    ${emailHeader("Club Administration Invitation")}

    <div style="padding: 40px 30px;">
      <h2 style="color:${BRAND.textDark}; margin-top:0;">
        You're invited to become a Club Admin!
      </h2>

      <p style="color:${BRAND.textLight}; font-size:16px; line-height:1.6;">
        <strong>${inviterName}</strong> invited you to manage 
        <strong style="color:${BRAND.accent};">${clubName}</strong>.
      </p>

      ${primaryButton("Accept Invitation", acceptLink)}

      <div style="text-align:center; margin-top:15px;">
        <a href="${rejectLink}" style="
          color:${BRAND.error};
          font-size:14px;
          text-decoration:none;
        ">
          Decline Invitation
        </a>
      </div>
    </div>
  `);

// =======================================================
// GUARDIAN INVITATION (FIXED - REQUIRED EXPORT)
// =======================================================
export const guardianInvitationTemplate = (
  memberName: string,
  groupName: string,
  inviterName: string,
  invitationLink: string,
) =>
  emailWrapper(`
    ${emailHeader("Guardian Confirmation Required")}

    <div style="padding: 40px 30px;">
      <h2 style="color:${BRAND.textDark}; margin-top:0;">
        Confirmation Required
      </h2>

      <p style="color:${BRAND.textLight}; font-size:16px; line-height:1.6;">
        <strong>${inviterName}</strong> added 
        <strong>${memberName}</strong> to 
        <strong style="color:${BRAND.accent};">${groupName}</strong>.
      </p>

      ${primaryButton("Confirm Participation", invitationLink)}

      <p style="font-size:14px; color:#999;">
        If the button doesn't work, copy this link:<br>
        <a href="${invitationLink}" style="color:${BRAND.accent}; word-break: break-all;">
          ${invitationLink}
        </a>
      </p>
    </div>
  `);

// =======================================================
// EMAIL VERIFICATION
// =======================================================
export const emailVerificationTemplate = (
  fullName: string,
  verificationLink: string,
  isResend = false,
) =>
  emailWrapper(`
    ${emailHeader("Account Verification")}

    <div style="padding: 40px 30px;">
      <h2 style="color:${BRAND.textDark}; margin-top:0;">
        ${isResend ? "Verify Your Email - Resent" : `Welcome ${fullName}!`}
      </h2>

      <p style="color:${BRAND.textLight}; font-size:16px; line-height:1.6;">
        Please verify your email address to activate your account.
      </p>

      ${primaryButton("Verify Your Email", verificationLink)}
    </div>
  `);
