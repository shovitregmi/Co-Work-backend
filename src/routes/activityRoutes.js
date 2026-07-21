const express = require('express');
const Activity = require('../models/Activity');
const { protect } = require('../middleware/auth');
const { restrictTo } = require('../middleware/role');

const router = express.Router();

// POST /api/activities — log an activity (internal use, called by other routes)
router.post('/', protect, async (req, res, next) => {
  try {
    const { action, description, entityType, entityId } = req.body;

    const activity = await Activity.create({
      userId: req.user._id,
      action,
      description,
      entityType,
      entityId,
    });

    res.status(201).json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
});

// GET /api/activities — get activities (admin sees all, PM/member see limited)
// ?limit=50&days=7 for filtering by days ago
router.get('/', protect, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const days = parseInt(req.query.days) || 30;
    const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let query = { createdAt: { $gte: dateThreshold } };

    // Non-admin users see only their own activities
    if (req.user.role !== 'admin') {
      query.userId = req.user._id;
    }

    const activities = await Activity.find(query)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ success: true, count: activities.length, data: activities });
  } catch (error) {
    next(error);
  }
});

// GET /api/activities/user/:userId — get activities by a specific user (admin only)
router.get('/user/:userId', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const days = parseInt(req.query.days) || 30;
    const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const activities = await Activity.find({
      userId: req.params.userId,
      createdAt: { $gte: dateThreshold },
    })
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ success: true, count: activities.length, data: activities });
  } catch (error) {
    next(error);
  }
});

module.exports = router;