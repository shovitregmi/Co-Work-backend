const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'task_assigned',
      'task_commented',
      'project_member_added',
      'project_created',
      'task_status_updated',
      'user_promoted',
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
  },
  relatedEntityType: {
    type: String,
    enum: ['project', 'task', 'user'],
  },
  relatedEntityId: mongoose.Schema.Types.ObjectId,
  isRead: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Notification', notificationSchema);