const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const FROM_ADDRESS = `"Co-Work" <${process.env.EMAIL_USER}>`;

const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const emailWrapper = (headerTitle, bodyContent) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background-color: #f7faf4;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-flex; align-items: center; gap: 8px;">
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background-color: #0f5238; color: white; font-weight: 700; font-size: 14px; line-height: 32px;">CW</span>
        <span style="font-weight: 700; font-size: 18px; color: #0f5238; vertical-align: middle;">Co-Work</span>
      </div>
    </div>

    <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 82, 56, 0.08); border: 1px solid #e5eae6;">
      <div style="background: linear-gradient(135deg, #0f5238 0%, #2d6a4f 100%); padding: 36px 32px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">${headerTitle}</h1>
      </div>

      <div style="padding: 32px;">
        ${bodyContent}
      </div>
    </div>

    <p style="text-align: center; font-size: 12px; color: #95a89b; margin-top: 24px;">
      © 2026 Co-Work. All rights reserved.<br/>
      This is an automated message, please don't reply to this email.
    </p>
  </div>
`;

const sendVerificationEmail = async (email, code) => {
  const bodyContent = `
    <p style="font-size: 15px; color: #181d19; margin: 0 0 16px 0; line-height: 1.6;">
      Welcome! To finish setting up your Co-Work account, enter the code below.
    </p>

    <div style="background-color: #f7faf4; border: 1px solid #dce5df; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #498f70;">
        Verification Code
      </p>
      <p style="margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0f5238; font-family: 'Courier New', monospace;">
        ${code}
      </p>
    </div>

    <p style="font-size: 13px; color: #404943; text-align: center; margin: 0 0 24px 0;">
      This code expires in <strong>15 minutes</strong>
    </p>

    <div style="border-top: 1px solid #ecefe9; padding-top: 20px;">
      <p style="font-size: 13px; color: #95a89b; margin: 0; line-height: 1.6;">
        Didn't request this? You can safely ignore this email — no account will be created.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: email,
      subject: "Your Co-Work verification code",
      html: emailWrapper("Verify your email", bodyContent),
    });
    return true;
  } catch (error) {
    console.error("Email send error:", error);
    return false;
  }
};

const sendPasswordResetEmail = async (email, token, userName) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  const bodyContent = `
    <p style="font-size: 15px; color: #181d19; margin: 0 0 8px 0; line-height: 1.6;">
      Hi <strong>${userName}</strong>,
    </p>
    <p style="font-size: 15px; color: #404943; margin: 0 0 28px 0; line-height: 1.6;">
      We received a request to reset your Co-Work password. Click below to choose a new one.
    </p>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${resetLink}" style="display: inline-block; background-color: #0f5238; color: #ffffff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 600;">
        Reset Password
      </a>
    </div>

    <p style="font-size: 13px; color: #404943; text-align: center; margin: 0 0 24px 0;">
      This link expires in <strong>1 hour</strong>
    </p>

    <div style="border-top: 1px solid #ecefe9; padding-top: 20px;">
      <p style="font-size: 13px; color: #95a89b; margin: 0; line-height: 1.6;">
        Didn't request this? You can safely ignore this email — your password won't change.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: email,
      subject: "Reset your Co-Work password",
      html: emailWrapper("Reset your password", bodyContent),
    });
    return true;
  } catch (error) {
    console.error("Email send error:", error);
    return false;
  }
};

module.exports = {
  generateCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
