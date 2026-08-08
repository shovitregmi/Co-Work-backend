const express = require('express');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const { protect } = require('../middleware/auth');
const { restrictTo } = require('../middleware/role');

const router = express.Router();

// POST /api/notifications — create notification (internal use)
router.post('/', protect, async (req, res, next) => {
  try {
    const { userId, type, title, message, relatedEntityType, relatedEntityId } = req.body;

    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
    });

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications — get current user's notifications
// Admin sees activity feed of team, others see personal notifications
router.get('/', protect, async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    let notifications = [];
    let unreadCount = 0;

    if (req.user.role === 'admin') {
      // Admin sees recent activities from the whole team
      const activities = await Activity.find()
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .limit(50);

      // Transform activities into notification-like objects for display
      notifications = activities.map((activity) => ({
        _id: activity._id,
        userId: activity.userId,
        type: 'activity',
        title: `${activity.userId?.name} - ${activity.action.replace(/_/g, ' ')}`,
        message: activity.description,
        isRead: false,
        createdAt: activity.createdAt,
      }));

      unreadCount = activities.length; // All activities shown as "unread"
    } else {
      // Regular users/PMs see personal notifications
      let query = { userId: req.user._id };
      if (unreadOnly) query.isRead = false;

      const personalNotifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .populate('relatedEntityId');

      notifications = personalNotifications;
      unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
    }

    res.json({ success: true, count: notifications.length, unreadCount, data: notifications });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', protect, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const activityCount = await Activity.countDocuments();
      return res.json({ success: true, unreadCount: activityCount });
    }

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });
    res.json({ success: true, unreadCount });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/:id/read — mark as read (personal notifications only)
router.put('/:id/read', protect, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(400).json({ message: 'Admin activities cannot be marked as read' });
    }

    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    if (notification.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    notification.isRead = true;
    await notification.save();
    res.json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/read-all — mark all personal as read
router.put('/read-all', protect, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(400).json({ message: 'Admin cannot mark activities as read' });
    }

    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', protect, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(400).json({ message: 'Admin activities cannot be deleted' });
    }

    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    if (notification.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await notification.deleteOne();
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;