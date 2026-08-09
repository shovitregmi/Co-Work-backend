const Notification = require('../models/Notification');

// Call this from other routes whenever something notification-worthy happens
const notify = async ({ userId, type, title, message, relatedEntityType, relatedEntityId }) => {
  try {
    await Notification.create({
      userId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
    });
  } catch (error) {
    console.error('Failed to create notification:', error.message);
    // Don't throw — a failed notification should never break the main action
  }
};

module.exports = notify;