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
      alt="Clubnizer Logo"
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
      Clubnizer
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
// SHARED FOOTER
// =======================================================
const emailFooter = () => `
  <div style="
    border-top: 1px solid ${BRAND.border};
    padding: 20px 30px;
    text-align: center;
  ">
    <p style="color: ${BRAND.textLight}; font-size: 13px; margin: 0; line-height: 1.6;">
      <strong style="color: ${BRAND.accent};">Clubnizer</strong> — Organize your club, simplify your game.
    </p>
    <p style="margin: 6px 0 0; font-size: 12px;">
      <a href="https://clubnizer.com" style="color: ${BRAND.textLight}; text-decoration: none;">clubnizer.com</a>
    </p>
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
    ${emailFooter()}
  </div>
`;

// =======================================================
// EMAIL TRANSPORTER
// =======================================================

// In emulator mode, use a no-op transporter that logs instead of sending
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

export const emailTransporter = isEmulator
  ? ({
      sendMail: async (mailOptions: nodemailer.SendMailOptions) => {
        console.log(
          `[EMULATOR] Skipping email send to: ${mailOptions.to}, ` +
            `subject: "${mailOptions.subject}"`,
        );
        return { messageId: "emulator-no-op" };
      },
    } as unknown as nodemailer.Transporter)
  : nodemailer.createTransport({
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

      <p style="color:${BRAND.textLight}; font-size:15px; line-height:1.6;">
        Clubnizer helps sports clubs manage teams, events, and communication
        &mdash; all in one place. Accept the invitation to get started with your team.
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
        <strong>${inviterName}</strong> has invited you to join 
        <strong style="color:${BRAND.accent};">${groupName}</strong> 
        in <strong>${clubName}</strong>.
      </p>

      <p style="color:${BRAND.textLight}; font-size:15px; line-height:1.6;">
        Clubnizer helps sports clubs manage teams, events, and communication
        &mdash; all in one place. Accept the invitation to get started with your team.
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
        <strong>${inviterName}</strong> has invited you to help manage 
        <strong style="color:${BRAND.accent};">${clubName}</strong> on Clubnizer.
      </p>

      <p style="color:${BRAND.textLight}; font-size:15px; line-height:1.6;">
        As a club administrator, you'll be able to manage members, create events,
        and oversee your club's activities.
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
        Your child has been added to a team
      </h2>

      <p style="color:${BRAND.textLight}; font-size:16px; line-height:1.6;">
        <strong>${inviterName}</strong> has added 
        <strong>${memberName}</strong> to 
        <strong style="color:${BRAND.accent};">${groupName}</strong> on Clubnizer.
        As the designated guardian, we need your confirmation before
        ${memberName} can participate.
      </p>

      <p style="color:${BRAND.textLight}; font-size:15px; line-height:1.6;">
        Clubnizer is a platform that helps sports clubs organize teams,
        schedule events, and communicate with members and guardians securely.
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
    ${emailHeader(isResend ? "Email Verification" : "Welcome to Clubnizer!")}

    <div style="padding: 40px 30px;">
      <h2 style="color:${BRAND.textDark}; margin-top:0;">
        ${isResend ? "Verify Your Email" : `Welcome ${fullName}!`}
      </h2>

      <p style="color:${BRAND.textLight}; font-size:16px; line-height:1.6;">
        ${
          isResend
            ? "A new verification link has been generated for you. Please click the button below to verify your email address."
            : "Thank you for joining Clubnizer &mdash; the platform that helps sports clubs manage teams, events, and communication. Please verify your email to get started."
        }
      </p>

      ${primaryButton("Verify Your Email", verificationLink)}
    </div>
  `);

// =======================================================
// NEWS EMAIL TEMPLATE
// =======================================================
export const newsEmailTemplate = (
  newsTitle: string,
  newsDescription: string,
  senderName: string,
  targetName: string, // group/club name
) =>
  emailWrapper(`
    ${emailHeader("News from " + targetName)}

    <div style="padding: 40px 30px;">
      <h2 style="color:${BRAND.textDark}; margin-top:0; text-align:center;">
        ${newsTitle}
      </h2>

      <div style="
        background-color: #f8f9fa;
        border-left: 4px solid ${BRAND.accent};
        padding: 20px;
        margin: 25px 0;
        border-radius: 0 8px 8px 0;
      ">
        <p style="
          color:${BRAND.textDark};
          font-size:16px;
          line-height:1.7;
          margin: 0;
          white-space: pre-wrap;
        ">
          ${newsDescription}
        </p>
      </div>

      <p style="
        color:${BRAND.textLight};
        font-size:14px;
        text-align:center;
        margin-top:30px;
      ">
        Sent by <strong>${senderName}</strong> via <strong style="color:${BRAND.accent};">${targetName}</strong> on Clubnizer
      </p>
    </div>
  `);
