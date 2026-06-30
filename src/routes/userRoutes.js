const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { restrictTo } = require('../middleware/role');

const router = express.Router();

// All routes below require login AND admin role
router.use(protect, restrictTo('admin'));

// @route   GET /api/users
// @desc    List all users (so admin can see who to promote)
router.get('/', async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/:id/promote
// @desc    Promote a 'member' to 'project_manager'
router.put('/:id/promote', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot change an admin\'s role' });
    }

    user.role = 'project_manager';
    await user.save();

    res.json({
      message: `${user.name} promoted to Project Manager`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;