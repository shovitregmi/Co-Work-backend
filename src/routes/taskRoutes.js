const express = require('express');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { protect } = require('../middleware/auth');
const { restrictTo } = require('../middleware/role');
const logActivity = require("../utils/logActivity");

const router = express.Router();

// POST /api/tasks — PM or admin creates + assigns task to a member
// body: { title, description, priority, deadline, projectId, assignedTo }
router.post('/', protect, restrictTo('admin', 'project_manager'), async (req, res, next) => {
  try {
    const { title, description, priority, deadline, projectId, assignedTo } = req.body;

    if (!projectId) return res.status(400).json({ message: 'projectId is required' });
    if (!assignedTo) return res.status(400).json({ message: 'assignedTo is required' });

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (
      req.user.role === 'project_manager' &&
      project.manager.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to create tasks in this project' });
    }

    const isMember = project.teamMembers.some((m) => m.toString() === assignedTo);
    if (!isMember) {
      return res.status(400).json({ message: 'Assigned user must be a member of this project' });
    }

    const task = await Task.create({ title, description, priority, deadline, projectId, assignedTo });
    await task.populate('assignedTo', 'name email');
await logActivity({
  userId: req.user._id,
  action: "task_created",
  description: `${req.user.name} created task "${task.title}"`,
  entityType: "task",
  entityId: task._id,
});

await logActivity({
  userId: req.user._id,
  action: "task_assigned",
  description: `Task "${task.title}" assigned to ${task.assignedTo.name}`,
  entityType: "task",
  entityId: task._id,
});


    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks — get tasks
// ?projectId=xxx  → all tasks in a project
// ?assignedToMe=true → tasks assigned to logged-in user
// members always see only their own tasks regardless of query
router.get('/', protect, async (req, res, next) => {
  try {
    let query = {};

    if (req.query.projectId) query.projectId = req.query.projectId;
    if (req.user.role === 'member') query.assignedTo = req.user._id;
    if (req.query.assignedToMe === 'true') query.assignedTo = req.user._id;

    const tasks = await Task.find(query)
      .populate('assignedTo', 'name email')
      .populate('projectId', 'title')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:id — single task
router.get('/:id', protect, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('projectId', 'title manager');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

// PUT /api/tasks/:id — update task
// member: can only update status of their own tasks
// PM: can update everything in their own projects
// admin: can update everything
router.put('/:id', protect, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (req.user.role === 'member') {
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to update this task' });
      }
      if (req.body.status) task.status = req.body.status;
      await task.save();
      await logActivity({
  userId: req.user._id,
  action:
    task.status === "Completed"
      ? "task_completed"
      : "task_updated",
  description:
    task.status === "Completed"
      ? `${req.user.name} completed task "${task.title}"`
      : `${req.user.name} updated task "${task.title}"`,
  entityType: "task",
  entityId: task._id,
});
      return res.json({ success: true, data: task });
    }

    if (req.user.role === 'project_manager') {
      const project = await Project.findById(task.projectId);
      if (project.manager.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to update this task' });
      }
    }

    const { title, description, priority, status, deadline, assignedTo } = req.body;
    if (title) task.title = title;
    if (description) task.description = description;
    if (priority) task.priority = priority;
    if (status) task.status = status;
    if (deadline) task.deadline = deadline;
    if (assignedTo) task.assignedTo = assignedTo;

    await task.save();
    await task.populate('assignedTo', 'name email');
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/tasks/:id — PM or admin only
router.delete('/:id', protect, restrictTo('admin', 'project_manager'), async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (req.user.role === 'project_manager') {
      const project = await Project.findById(task.projectId);
      if (project.manager.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to delete this task' });
      }
    }

    await task.deleteOne();
    await logActivity({
  userId: req.user._id,
  action: "task_deleted",
  description: `${req.user.name} deleted task "${task.title}"`,
  entityType: "task",
  entityId: task._id,
});
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/progress/by-status — count tasks by status in a project
// Query: ?projectId=xxx
router.get('/progress/by-status', protect, async (req, res, next) => {
  try {
    const projectId = req.query.projectId;

    if (!projectId) {
      return res.status(400).json({ message: 'projectId query param required' });
    }

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Check authorization
    const isMember = project.teamMembers.some((m) => m.toString() === req.user._id.toString());
    const isManager = project.manager.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isManager && !isMember) {
      return res.status(403).json({ message: 'Not authorized to view this project' });
    }

    const statusCounts = await Task.aggregate([
      { $match: { projectId: mongoose.Types.ObjectId(projectId) } },
      {
        $group: {
          _id: '$status',
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
      progress.percentages[s._id] = total > 0 ? Math.round((s.count / total) * 100) : 0;
    });

    res.json({ success: true, data: progress });
  } catch (error) {
    next(error);
  }
});

module.exports = router;