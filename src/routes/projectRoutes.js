const express = require('express');
const Project = require('../models/Project');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { restrictTo } = require('../middleware/role');
const logActivity = require("../utils/logActivity");

const router = express.Router();

// POST /api/projects — create project
// Admin must pass managerId in body to assign a PM
// PM auto-assigned as manager
router.post('/', protect, restrictTo('admin', 'project_manager'), async (req, res, next) => {
  try {
    const { title, description, deadline, managerId } = req.body;
    let manager = req.user._id;

    if (req.user.role === 'admin') {
      if (!managerId) {
        return res.status(400).json({ message: 'Admin must assign a Project Manager' });
      }
      const pm = await User.findById(managerId);
      if (!pm) return res.status(404).json({ message: 'Project Manager not found' });
      if (pm.role !== 'project_manager') {
        return res.status(400).json({ message: 'Assigned user must have project_manager role' });
      }
      manager = managerId;
    }

    const project = await Project.create({ title, description, deadline, manager });
    await project.populate('manager', 'name email role');
    await logActivity({
  userId: req.user._id,
  action: "project_created",
  description: `${req.user.name} created project "${project.title}"`,
  entityType: "project",
  entityId: project._id,
});
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects — list projects (role filtered)
router.get('/', protect, async (req, res, next) => {
  try {
    let projects;
    if (req.user.role === 'admin') {
      projects = await Project.find()
        .populate('manager', 'name email')
        .populate('teamMembers', 'name email role')
        .sort({ createdAt: -1 });
    } else {
      projects = await Project.find({
        $or: [{ manager: req.user._id }, { teamMembers: req.user._id }],
      })
        .populate('manager', 'name email')
        .populate('teamMembers', 'name email role')
        .sort({ createdAt: -1 });
    }
    res.json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:id — single project
router.get('/:id', protect, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('manager', 'name email role')
      .populate('teamMembers', 'name email role');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    const isMember = project.teamMembers.some(
      (m) => m._id.toString() === req.user._id.toString()
    );
    const isManager = project.manager._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isManager && !isMember) {
      return res.status(403).json({ message: 'Not authorized to view this project' });
    }

    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

// PUT /api/projects/:id — update project (admin or assigned PM)
router.put('/:id', protect, restrictTo('admin', 'project_manager'), async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (
      req.user.role === 'project_manager' &&
      project.manager.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to update this project' });
    }

    const { title, description, deadline, status } = req.body;
    if (title) project.title = title;
    if (description) project.description = description;
    if (deadline) project.deadline = deadline;
    if (status) project.status = status;

    await project.save();
    await logActivity({
  userId: req.user._id,
  action: "project_updated",
  description: `${req.user.name} updated project "${project.title}"`,
  entityType: "project",
  entityId: project._id,
});
    await project.populate('manager', 'name email');
    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/projects/:id — admin only
router.delete('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    await project.deleteOne();
    await logActivity({
  userId: req.user._id,
  action: "project_deleted",
  description: `${req.user.name} deleted project "${project.title}"`,
  entityType: "project",
  entityId: project._id,
});
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    next(error);
  }
});

// POST /api/projects/:id/members — add members (admin or assigned PM)
// body: { memberIds: ['id1', 'id2'] }
router.post('/:id/members', protect, restrictTo('admin', 'project_manager'), async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (
      req.user.role === 'project_manager' &&
      project.manager.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to manage this project' });
    }

    const { memberIds } = req.body;
    if (!memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ message: 'memberIds must be an array of user IDs' });
    }

    memberIds.forEach((id) => {
      if (!project.teamMembers.includes(id)) {
        project.teamMembers.push(id);
      }
    });

    await project.save();
    await logActivity({
  userId: req.user._id,
  action: "member_added_to_project",
  description: `${req.user.name} added members to "${project.title}"`,
  entityType: "project",
  entityId: project._id,
});
    await project.populate('teamMembers', 'name email role');
    res.json({ success: true, message: 'Members added', data: project });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/projects/:id/members/:memberId — remove a member
router.delete('/:id/members/:memberId', protect, restrictTo('admin', 'project_manager'), async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (
      req.user.role === 'project_manager' &&
      project.manager.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to manage this project' });
    }

    project.teamMembers = project.teamMembers.filter(
      (m) => m.toString() !== req.params.memberId
    );

    await project.save();
    await logActivity({
  userId: req.user._id,
  action: "member_removed_from_project",
  description: `${req.user.name} removed a member from "${project.title}"`,
  entityType: "project",
  entityId: project._id,
});
    res.json({ success: true, message: 'Member removed', data: project });
  } catch (error) {
    next(error);
  }
});

// PUT /api/projects/:id/assign-manager — reassign PM (admin only)
// body: { managerId: 'userId' }
router.put('/:id/assign-manager', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { managerId } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const pm = await User.findById(managerId);
    if (!pm || pm.role !== 'project_manager') {
      return res.status(400).json({ message: 'Assigned user must have project_manager role' });
    }

    project.manager = managerId;
    await project.save();
    await logActivity({
  userId: req.user._id,
  action: "project_updated",
  description: `${req.user.name} reassigned manager for "${project.title}"`,
  entityType: "project",
  entityId: project._id,
});
    await project.populate('manager', 'name email role');
    res.json({ success: true, message: 'Project manager updated', data: project });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/stats/member-projects — all members with their project counts (admin only)
router.get('/stats/member-projects', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const members = await User.find({ role: 'member' }).select('_id name email');

    const memberStats = await Promise.all(
      members.map(async (member) => {
        const projectCount = await Project.countDocuments({
          teamMembers: member._id,
        });
        return {
          memberId: member._id,
          memberName: member.name,
          memberEmail: member.email,
          projectsAssigned: projectCount,
        };
      })
    );

    res.json({ success: true, data: memberStats });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/stats/pm-projects — all PMs with their project counts (admin only)
router.get('/stats/pm-projects', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const pms = await User.find({ role: 'project_manager' }).select('_id name email');

    const pmStats = await Promise.all(
      pms.map(async (pm) => {
        const projectCount = await Project.countDocuments({ manager: pm._id });
        const tasks = await Task.find({
          projectId: { $in: (await Project.find({ manager: pm._id }).select('_id')).map((p) => p._id) },
        });
        const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
        return {
          pmId: pm._id,
          pmName: pm.name,
          pmEmail: pm.email,
          projectsManaged: projectCount,
          totalTasks: tasks.length,
          completedTasks,
          completionPercentage: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
        };
      })
    );

    res.json({ success: true, data: pmStats });
  } catch (error) {
    next(error);
  }
});

module.exports = router;