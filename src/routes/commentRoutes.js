const express = require("express");
const Comment = require("../models/Comment");
const Task = require("../models/Task");
const Project = require("../models/project");
const { protect } = require("../middleware/auth");
const logActivity = require("../utils/logActivity");

const router = express.Router();

// POST /api/comments — add comment to a task
// body: { taskId, text, attachments[] }
router.post("/", protect, async (req, res, next) => {
  try {
    const { taskId, text, attachments } = req.body;
    if (!taskId) return res.status(400).json({ message: "taskId is required" });
    if (!text)
      return res.status(400).json({ message: "Comment text is required" });

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const project = await Project.findById(task.projectId);
    const isMember = project.teamMembers.some(
      (m) => m.toString() === req.user._id.toString(),
    );
    const isManager = project.manager.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isMember && !isManager && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to comment on this task" });
    }

    const comment = await Comment.create({
      taskId,
      userId: req.user._id,
      text,
      attachments: attachments || [],
    });

    await comment.populate("userId", "name email");
    await logActivity({
      userId: req.user._id,
      action: "comment_added",
      description: `${req.user.name} commented on a task`,
      entityType: "comment",
      entityId: comment._id,
    });
    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    next(error);
  }
});

// GET /api/comments?taskId=xxx — get comments for a task
router.get("/", protect, async (req, res, next) => {
  try {
    const { taskId } = req.query;
    if (!taskId)
      return res
        .status(400)
        .json({ message: "taskId query param is required" });

    const comments = await Comment.find({ taskId })
      .populate("userId", "name email")
      .sort({ createdAt: 1 });

    res.json({ success: true, count: comments.length, data: comments });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/comments/:id — delete own comment (admin can delete any)
router.delete("/:id", protect, async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const isOwner = comment.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this comment" });
    }

    await comment.deleteOne();
    await logActivity({
      userId: req.user._id,
      action: "comment_deleted",
      description: `${req.user.name} deleted a comment`,
      entityType: "comment",
      entityId: comment._id,
    });
    res.json({ success: true, message: "Comment deleted" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
