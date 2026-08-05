const Activity = require("../models/Activity");

const logActivity = async ({
  userId,
  action,
  description,
  entityType,
  entityId,
}) => {
  try {
    await Activity.create({
      userId,
      action,
      description,
      entityType,
      entityId,
    });
  } catch (err) {
    console.error("Failed to log activity:", err.message);
    
  }
};

module.exports = logActivity;