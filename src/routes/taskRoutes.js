const express = require("express");
const Task = require("../models/Task");
const Project = require("../models/project");
const { protect } = require("../middleware/auth");
const { restrictTo } = require("../middleware/role");
const mongoose = require("mongoose");
const notify = require("../utils/notify");

const router = express.Router();

// Helper function to check if user has access to a project
const checkProjectAccess = async (projectId, userId, userRole) => {
  const project = await Project.findById(projectId);
  if (!project) return { authorized: false, error: "Project not found" };

  const isMember = project.teamMembers.some(
    (m) => m.toString() === userId.toString(),
  );
  const isManager = project.manager.toString() === userId.toString();
  const isAdmin = userRole === "admin";

  if (!isAdmin && !isManager && !isMember) {
    return {
      authorized: false,
      error: "Not authorized to access this project",
    };
  }

  return { authorized: true, project };
};

// POST /api/tasks — PM or admin creates + assigns task to a member
// body: { title, description, priority, deadline, projectId, assignedTo }
router.post(
  "/",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      const { title, description, priority, deadline, projectId, assignedTo } =
        req.body;

      if (!projectId)
        return res.status(400).json({ message: "projectId is required" });
      if (!assignedTo)
        return res.status(400).json({ message: "assignedTo is required" });

      const project = await Project.findById(projectId);
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      // PM can only create tasks in their own projects
      if (
        req.user.role === "project_manager" &&
        project.manager.toString() !== req.user._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to create tasks in this project" });
      }

      const isMember = project.teamMembers.some(
        (m) => m.toString() === assignedTo,
      );
      if (!isMember) {
        return res
          .status(400)
          .json({ message: "Assigned user must be a member of this project" });
      }

      const task = await Task.create({
        title,
        description,
        priority,
        deadline,
        projectId,
        assignedTo,
      });
      await task.populate("assignedTo", "name email");

      // Notify the assigned member
      await notify({
        userId: assignedTo,
        type: "task_assigned",
        title: `New task assigned: ${task.title}`,
        message: `You've been assigned a new task in ${project.title}`,
        relatedEntityType: "task",
        relatedEntityId: task._id,
      });

      res.status(201).json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/tasks — get tasks with proper access control
// ?projectId=xxx  → all tasks in that project (only if user has access)
// ?assignedToMe=true → tasks assigned to logged-in user
// Members always see only their own tasks
// PMs see only tasks in their managed projects
// Admin sees all tasks
router.get("/", protect, async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role === "admin") {
      // Admin sees all tasks, optionally filtered by project
      if (req.query.projectId) query.projectId = req.query.projectId;
    } else if (req.user.role === "project_manager") {
      // PM sees tasks only in their managed projects
      if (req.query.projectId) {
        // If specific project is requested, verify PM manages it
        const project = await Project.findById(req.query.projectId);
        if (
          !project ||
          project.manager.toString() !== req.user._id.toString()
        ) {
          return res
            .status(403)
            .json({ message: "Not authorized to view tasks in this project" });
        }
        query.projectId = req.query.projectId;
      } else {
        // Show all tasks in all projects this PM manages
        const pmProjects = await Project.find({ manager: req.user._id }).select(
          "_id",
        );
        query.projectId = { $in: pmProjects.map((p) => p._id) };
      }
    } else {
      // Member sees only tasks assigned to them
      query.assignedTo = req.user._id;
    }

    // Additional filter if explicitly requested
    if (req.query.assignedToMe === "true" && req.user.role !== "member") {
      query.assignedTo = req.user._id;
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "name email")
      .populate("projectId", "title")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:id — single task (with access control)
router.get("/:id", protect, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assignedTo", "name email")
      .populate("projectId", "title manager");

    if (!task) return res.status(404).json({ message: "Task not found" });

    // Check access to the project this task belongs to
    const accessCheck = await checkProjectAccess(
      task.projectId._id,
      req.user._id,
      req.user.role,
    );
    if (!accessCheck.authorized) {
      return res.status(403).json({ message: accessCheck.error });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

// PUT /api/tasks/:id — update task (with strict access control)
// member: can only update status of their own tasks
// PM: can update everything in their own projects
// admin: can update everything
router.put("/:id", protect, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Check project access first
    const accessCheck = await checkProjectAccess(
      task.projectId,
      req.user._id,
      req.user.role,
    );
    if (!accessCheck.authorized) {
      return res.status(403).json({ message: accessCheck.error });
    }

    if (req.user.role === "member") {
      // Member can only update status of their own tasks
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this task" });
      }
      if (req.body.status) task.status = req.body.status;
      await task.save();

      // Notify the PM/manager of the project that status changed
      const project = accessCheck.project;
      await notify({
        userId: project.manager,
        type: "task_status_updated",
        title: `Task updated: ${task.title}`,
        message: `Status changed to "${task.status}" by ${req.user.name}`,
        relatedEntityType: "task",
        relatedEntityId: task._id,
      });

      return res.json({ success: true, data: task });
    }

    // PM or Admin — can update everything
    const { title, description, priority, status, deadline, assignedTo } =
      req.body;
    const previousAssignee = task.assignedTo.toString();

    if (title) task.title = title;
    if (description) task.description = description;
    if (priority) task.priority = priority;
    if (status) task.status = status;
    if (deadline) task.deadline = deadline;
    if (assignedTo) task.assignedTo = assignedTo;

    await task.save();
    await task.populate("assignedTo", "name email");

    // If reassigned to a different member, notify the new assignee
    if (assignedTo && assignedTo !== previousAssignee) {
      await notify({
        userId: assignedTo,
        type: "task_assigned",
        title: `Task assigned to you: ${task.title}`,
        message: `You've been assigned this task`,
        relatedEntityType: "task",
        relatedEntityId: task._id,
      });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/tasks/:id — PM or admin only (with project ownership check)
router.delete(
  "/:id",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      // Check project access
      const accessCheck = await checkProjectAccess(
        task.projectId,
        req.user._id,
        req.user.role,
      );
      if (!accessCheck.authorized) {
        return res.status(403).json({ message: accessCheck.error });
      }

      await task.deleteOne();
      res.json({ success: true, message: "Task deleted" });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/tasks/progress/by-status — count tasks by status in a project
// Query: ?projectId=xxx
router.get("/progress/by-status", protect, async (req, res, next) => {
  try {
    const projectId = req.query.projectId;

    if (!projectId) {
      return res
        .status(400)
        .json({ message: "projectId query param required" });
    }

    // Check project access
    const accessCheck = await checkProjectAccess(
      projectId,
      req.user._id,
      req.user.role,
    );
    if (!accessCheck.authorized) {
      return res.status(403).json({ message: accessCheck.error });
    }

    const statusCounts = await Task.aggregate([
      { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const total = statusCounts.reduce((sum, s) => sum + s.count, 0);

    const progress = {
      total,
      byStatus: {},
      percentages: {},
    };

    statusCounts.forEach((s) => {
      progress.byStatus[s._id] = s.count;
      progress.percentages[s._id] =
        total > 0 ? Math.round((s.count / total) * 100) : 0;
    });

    res.json({ success: true, data: progress });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
