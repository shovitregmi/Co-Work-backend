const express = require("express");
const crypto = require("crypto");
const User = require("../models/user");
const generateToken = require("../utils/token");
const { protect } = require("../middleware/auth");
const { validateRegister, validateLogin } = require("../middleware/validate");
const {
  generateCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../utils/emailService");

const router = express.Router();

const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  availability: user.availability,
  emailVerified: user.emailVerified,
});

// POST /api/auth/send-verification-code — send verification code to email
router.post("/send-verification-code", async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    let userExists = await User.findOne({ email });
    if (userExists && userExists.emailVerified) {
      return res
        .status(400)
        .json({ message: "Email already registered and verified" });
    }

    // Rate limit: 1 code per 60 seconds
    if (userExists && userExists.lastVerificationCodeSentAt) {
      const timeSinceLastCode =
        (Date.now() - userExists.lastVerificationCodeSentAt) / 1000;
      if (timeSinceLastCode < 60) {
        return res.status(400).json({
          message: `Please wait ${Math.ceil(60 - timeSinceLastCode)} seconds before requesting another code`,
        });
      }
    }

    const code = generateCode();
    const codeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    if (userExists) {
      // Existing (unverified) user — update their code
      userExists.emailVerificationCode = code;
      userExists.emailVerificationExpires = codeExpiry;
      userExists.lastVerificationCodeSentAt = new Date();
      await userExists.save();
    } else {
      // Brand new email — create a placeholder user document to hold the code
      // Temporary throwaway password; real password gets set at /register
      await User.create({
        name: "Pending",
        email,
        password: crypto.randomBytes(16).toString("hex"),
        role: "member",
        emailVerified: false,
        emailVerificationCode: code,
        emailVerificationExpires: codeExpiry,
        lastVerificationCodeSentAt: new Date(),
      });
    }

    const sent = await sendVerificationEmail(email, code);
    if (!sent) {
      return res
        .status(500)
        .json({ message: "Failed to send verification email" });
    }

    res.json({ success: true, message: "Verification code sent to email" });
  } catch (error) {
    next(error);
  }
});
// POST /api/auth/register — register with verified email
router.post("/register", validateRegister, async (req, res, next) => {
  try {
    const { name, email, password, emailVerificationCode } = req.body;

    if (!emailVerificationCode) {
      return res
        .status(400)
        .json({ message: "Email verification code is required" });
    }

    // Check if email already registered and verified
    let user = await User.findOne({ email }).select(
      "+emailVerificationCode +emailVerificationExpires",
    );

    if (user && user.emailVerified) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Verify code
    if (!user || user.emailVerificationCode !== emailVerificationCode) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    if (new Date() > user.emailVerificationExpires) {
      return res.status(400).json({ message: "Verification code has expired" });
    }

    // Update existing user or create new one
    if (user) {
      user.name = name;
      user.password = password;
      user.emailVerified = true;
      user.emailVerificationCode = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();
    } else {
      user = await User.create({
        name,
        email,
        password,
        role: "member",
        emailVerified: true,
      });
    }

    res.status(201).json({
      user: formatUser(user),
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post("/login", validateLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message:
          "Please verify your email first. Check your inbox for the verification code.",
      });
    }

    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({
      user: formatUser(user),
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  res.json({ user: formatUser(req.user) });
});

// POST /api/auth/forgot-password — initiate password reset
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Don't leak if user exists
      return res.json({
        success: true,
        message: "If email exists, password reset link will be sent",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.passwordResetToken = resetTokenHash;
    user.passwordResetExpires = resetExpiry;
    await user.save();

    const sent = await sendPasswordResetEmail(email, resetToken, user.name);
    if (!sent) {
      return res.status(500).json({ message: "Failed to send reset email" });
    }

    res.json({ success: true, message: "Password reset link sent to email" });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reset-password — reset password with token
router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token" });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully. You can now login.",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
