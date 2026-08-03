import { config } from "../utils/config";
import { adminWelcomeTemplate, emailTransporter } from "../utils/email";

const APP_URL = "https://app.clubnizer.com";

export async function sendAdminWelcomeEmail(
  email: string,
  fullName: string,
  clubName: string,
): Promise<void> {
  try {
    const mailOptions = {
      from: config.email.from,
      to: email,
      subject: `Welcome to Clubnizer — next steps for ${clubName}`,
      html: adminWelcomeTemplate(fullName, clubName, APP_URL),
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email} for club "${clubName}"`);
  } catch (error) {
    console.error("Failed to send admin welcome email:", error);
  }
}
