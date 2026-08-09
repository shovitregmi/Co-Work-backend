const express = require("express");
const Activity = require("../models/Activity");
const { protect } = require("../middleware/auth");
const { restrictTo } = require("../middleware/role");

const router = express.Router();

// POST /api/activities — log an activity (internal use, called by other routes)
router.post("/", protect, async (req, res, next) => {
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
router.get("/", protect, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const days = parseInt(req.query.days) || 30;
    const category = req.query.category || "all";
    const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const activityGroups = {
      users: [
        "user_registered",
        "user_updated",
        "user_deleted",
        "user_promoted",
        "user_demoted",
        "availability_updated",
      ],
      projects: [
        "project_created",
        "project_updated",
        "project_deleted",
        "project_manager_changed",
        "member_added_to_project",
        "member_removed_from_project",
      ],
      tasks: [
        "task_created",
        "task_updated",
        "task_completed",
        "task_deleted",
        "task_assigned",
      ],
      comments: ["comment_added", "comment_deleted"],
    };

    let query = { createdAt: { $gte: dateThreshold } };
    if (category !== "all" && activityGroups[category]) {
      query.action = { $in: activityGroups[category] };
    }

    // Non-admin users see only their own activities
    if (req.user.role !== "admin") {
      query.userId = req.user._id;
    }

    const activities = await Activity.find(query)
      .populate("userId", "name email role")
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ success: true, count: activities.length, data: activities });
  } catch (error) {
    next(error);
  }
});

// GET /api/activities/user/:userId — get activities by a specific user (admin only)
router.get(
  "/user/:userId",
  protect,
  restrictTo("admin"),
  async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const days = parseInt(req.query.days) || 30;
      const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const activities = await Activity.find({
        userId: req.params.userId,
        createdAt: { $gte: dateThreshold },
      })
        .populate("userId", "name email role")
        .sort({ createdAt: -1 })
        .limit(limit);

      res.json({ success: true, count: activities.length, data: activities });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
