const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

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
router.get('/', protect, async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    let query = { userId: req.user._id };

    if (unreadOnly) query.isRead = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .populate('relatedEntityId');

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });

    res.json({ success: true, count: notifications.length, unreadCount, data: notifications });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/unread-count — quick endpoint for badge
router.get('/unread-count', protect, async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });
    res.json({ success: true, unreadCount });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/:id/read — mark single notification as read
router.put('/:id/read', protect, async (req, res, next) => {
  try {
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

// PUT /api/notifications/read-all — mark all as read
router.put('/read-all', protect, async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notifications/:id — delete a notification
router.delete('/:id', protect, async (req, res, next) => {
  try {
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