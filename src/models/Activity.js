const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  action: {
    type: String,
    enum: [
      'project_created',
      'project_updated',
      'project_deleted',
      'task_created',
      'task_updated',
      'task_completed',
      'member_added_to_project',
      'member_removed_from_project',
      'user_promoted',
      'user_demoted',
      'comment_added',
    ],
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  entityType: {
    type: String,
    enum: ['project', 'task', 'user', 'comment'],
  },
  entityId: mongoose.Schema.Types.ObjectId,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Activity', activitySchema);