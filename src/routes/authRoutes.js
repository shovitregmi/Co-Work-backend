const express = require('express');
const User = require('../models/User');
const generateToken = require('../utils/token');
const { protect } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validate');
const logActivity = require("../utils/logActivity");

const router = express.Router();

// Helper to format user response consistently
const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  availability: user.availability,
});

// POST /api/auth/register
router.post('/register', validateRegister, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password, role: 'member' });
    await logActivity({
  userId: user._id,
  action: "user_registered", 
  description: `${user.name} registered`,
  entityType: "user",
  entityId: user._id,
});

    res.status(201).json({
      user: formatUser(user),
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
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
router.get('/me', protect, async (req, res) => {
  res.json({ user: formatUser(req.user) });
});

module.exports = router;