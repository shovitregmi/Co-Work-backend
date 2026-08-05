const express = require('express');
const Project = require('../models/project');
const Task = require('../models/Task');
const User = require('../models/user');
const { protect } = require('../middleware/auth');
const { restrictTo } = require('../middleware/role');

const router = express.Router();

// GET /api/reports/project/:projectId — detailed report for one project
// Admin sees all, PM sees their own, member sees if assigned
router.get('/project/:projectId', protect, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate('manager', 'name email')
      .populate('teamMembers', 'name email');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Check authorization
    const isMember = project.teamMembers.some((m) => m._id.toString() === req.user._id.toString());
    const isManager = project.manager._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isManager && !isMember) {
      return res.status(403).json({ message: 'Not authorized to view this report' });
    }

    const tasks = await Task.find({ projectId: req.params.projectId });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'In Progress').length;
    const todoTasks = tasks.filter((t) => t.status === 'To Do').length;
    const reviewTasks = tasks.filter((t) => t.status === 'Review').length;

    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Task breakdown by assigned member
    const tasksByMember = {};
    project.teamMembers.forEach((member) => {
      tasksByMember[member.name] = {
        assigned: tasks.filter((t) => t.assignedTo.toString() === member._id.toString()).length,
        completed: tasks.filter(
          (t) => t.assignedTo.toString() === member._id.toString() && t.status === 'Completed'
        ).length,
      };
    });

    res.json({
      success: true,
      data: {
        projectName: project.title,
        manager: project.manager.name,
        status: project.status,
        deadline: project.deadline,
        teamSize: project.teamMembers.length,
        totalTasks,
        completedTasks,
        inProgressTasks,
        todoTasks,
        reviewTasks,
        completionPercentage,
        tasksByMember,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/user/:userId — user's task completion report (admin, PM, or self)
router.get('/user/:userId', protect, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const isSelf = req.params.userId === req.user._id.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Not authorized to view this report' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const tasks = await Task.find({ assignedTo: req.params.userId });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'In Progress').length;
    const todoTasks = tasks.filter((t) => t.status === 'To Do').length;
    const reviewTasks = tasks.filter((t) => t.status === 'Review').length;

    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Get project names for each task
    const taskDetails = await Promise.all(
      tasks.map(async (task) => {
        const project = await Project.findById(task.projectId).select('title');
        return {
          taskTitle: task.title,
          projectName: project?.title || 'Deleted Project',
          status: task.status,
          priority: task.priority,
          deadline: task.deadline,
        };
      })
    );

    res.json({
      success: true,
      data: {
        userName: user.name,
        userRole: user.role,
        totalAssignedTasks: totalTasks,
        completedTasks,
        inProgressTasks,
        todoTasks,
        reviewTasks,
        completionPercentage,
        tasks: taskDetails,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/admin/overview — full system report (admin only)
router.get('/admin/overview', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProjects = await Project.countDocuments();
    const totalTasks = await Task.countDocuments();

    const completedTasks = await Task.countDocuments({ status: 'Completed' });
    const inProgressTasks = await Task.countDocuments({ status: 'In Progress' });
    const todoTasks = await Task.countDocuments({ status: 'To Do' });

    const members = await User.countDocuments({ role: 'member' });
    const pms = await User.countDocuments({ role: 'project_manager' });
    const admins = await User.countDocuments({ role: 'admin' });

    // Active projects (not completed)
    const activeProjects = await Project.countDocuments({ status: { $ne: 'completed' } });

    // Most active PM (assigned to most projects)
    const pmStats = await Project.aggregate([
      {
        $group: {
          _id: '$manager',
          projectCount: { $sum: 1 },
        },
      },
      { $sort: { projectCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'pmInfo',
        },
      },
    ]);

    const topPMs = pmStats.map((pm) => ({
      pmName: pm.pmInfo[0]?.name || 'Unknown',
      projectCount: pm.projectCount,
    }));

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, members, projectManagers: pms, admins },
        projects: { total: totalProjects, active: activeProjects },
        tasks: { total: totalTasks, completed: completedTasks, inProgress: inProgressTasks, todo: todoTasks },
        topProjectManagers: topPMs,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;