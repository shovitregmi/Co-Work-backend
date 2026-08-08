const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
};

const sendVerificationEmail = async (email, code, userName) => {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0f5238 0%, #2d6a4f 100%); color: white; padding: 30px; border-radius: 10px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px;">Email Verification</h1>
      </div>
      
      <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Hi <strong>${userName}</strong>,</p>
        
        <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;">
          Thank you for signing up! To complete your registration, please verify your email address using the code below:
        </p>
        
        <div style="background-color: #0f5238; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
          <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Verification Code</p>
          <h2 style="margin: 10px 0 0 0; font-size: 40px; letter-spacing: 5px; font-weight: bold;">${code}</h2>
        </div>
        
        <p style="font-size: 12px; color: #999; text-align: center; margin: 20px 0;">
          This code will expire in <strong>15 minutes</strong>
        </p>
        
        <p style="font-size: 14px; color: #555; line-height: 1.6; margin-top: 30px;">
          If you didn't create this account, please ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #999; text-align: center;">
          © 2024 Project Management System. All rights reserved.
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email Address',
      html: htmlContent,
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

const sendPasswordResetEmail = async (email, token, userName) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0f5238 0%, #2d6a4f 100%); color: white; padding: 30px; border-radius: 10px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px;">Password Reset Request</h1>
      </div>
      
      <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Hi <strong>${userName}</strong>,</p>
        
        <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 30px;">
          We received a request to reset your password. Click the button below to create a new password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0f5238; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p style="font-size: 12px; color: #999; text-align: center; margin: 20px 0;">
          This link will expire in <strong>1 hour</strong>
        </p>
        
        <p style="font-size: 14px; color: #555; line-height: 1.6; margin-top: 30px;">
          If you didn't request this, you can safely ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #999; text-align: center;">
          © 2024 Project Management System. All rights reserved.
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Your Password',
      html: htmlContent,
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

module.exports = {
  generateCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
};