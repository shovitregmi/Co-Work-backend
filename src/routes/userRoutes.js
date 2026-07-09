const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { restrictTo } = require('../middleware/role');

const router = express.Router();

// All routes require login + admin role
router.use(protect, restrictTo('admin'));

// GET /api/users — list all users
router.get('/', async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id — get single user
router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id/promote — member → project_manager
router.put('/:id/promote', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(400).json({ message: "Cannot change an admin's role" });
    }
    user.role = 'project_manager';
    await user.save();
    res.json({
      success: true,
      message: `${user.name} promoted to Project Manager`,
      data: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id/demote — project_manager → member
router.put('/:id/demote', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(400).json({ message: "Cannot change an admin's role" });
    }
    if (user.role === 'member') {
      return res.status(400).json({ message: 'User is already a member' });
    }
    user.role = 'member';
    await user.save();
    res.json({
      success: true,
      message: `${user.name} demoted to Member`,
      data: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id — edit name/email
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email;
    }

    if (name) user.name = name;
    await user.save();

    res.json({
      success: true,
      message: 'User updated',
      data: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id — delete user, cannot delete self
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await user.deleteOne();
    res.json({ success: true, message: `${user.name} has been deleted` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;