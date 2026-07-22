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
  // User
  "user_registered",
  "user_updated",
  "user_deleted",
  "user_promoted",
  "user_demoted",
  "availability_updated",

  // Project
  "project_created",
  "project_updated",
  "project_deleted",
  "project_manager_changed",

  // Members
  "member_added_to_project",
  "member_removed_from_project",

  // Tasks
  "task_created",
  "task_updated",
  "task_completed",
  "task_deleted",
  "task_assigned",

  // Comments
  "comment_added",
  "comment_deleted",
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