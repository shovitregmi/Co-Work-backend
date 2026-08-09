const express = require("express");
const Project = require("../models/Project");
const User = require("../models/User");
const Task = require("../models/Task");
const Activity = require("../models/Activity");
const { protect } = require("../middleware/auth");
const { restrictTo } = require("../middleware/role");
const mongoose = require("mongoose");
const notify = require("../utils/notify");

const router = express.Router();

// Helper to log activity (admin audit trail)
const logActivity = async (
  userId,
  action,
  description,
  entityType,
  entityId,
) => {
  try {
    await Activity.create({
      userId,
      action,
      description,
      entityType,
      entityId,
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
};

// POST /api/projects — create project
// Admin must pass managerId in body to assign a PM
// PM auto-assigned as manager
router.post(
  "/",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      const { title, description, deadline, managerId } = req.body;
      let manager = req.user._id;

      if (req.user.role === "admin") {
        if (!managerId) {
          return res
            .status(400)
            .json({ message: "Admin must assign a Project Manager" });
        }
        const pm = await User.findById(managerId);
        if (!pm)
          return res.status(404).json({ message: "Project Manager not found" });
        if (pm.role !== "project_manager") {
          return res
            .status(400)
            .json({ message: "Assigned user must have project_manager role" });
        }
        manager = managerId;
      }

      const project = await Project.create({
        title,
        description,
        deadline,
        manager,
      });
      await project.populate("manager", "name email role");

      // Log activity
      await logActivity(
        req.user._id,
        "project_created",
        `Created project "${project.title}"`,
        "project",
        project._id,
      );

      // Notify the PM if admin assigned them to a new project
      if (req.user.role === "admin") {
        await notify({
          userId: manager,
          type: "project_created",
          title: `You've been assigned a new project: ${project.title}`,
          message: `Admin assigned you as manager for this project`,
          relatedEntityType: "project",
          relatedEntityId: project._id,
        });
      }

      res.status(201).json({ success: true, data: project });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/projects — list projects (role filtered)
router.get("/", protect, async (req, res, next) => {
  try {
    let projects;
    if (req.user.role === "admin") {
      projects = await Project.find()
        .populate("manager", "name email")
        .populate("teamMembers", "name email role")
        .sort({ createdAt: -1 });
    } else {
      projects = await Project.find({
        $or: [{ manager: req.user._id }, { teamMembers: req.user._id }],
      })
        .populate("manager", "name email")
        .populate("teamMembers", "name email role")
        .sort({ createdAt: -1 });
    }
    res.json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:id — single project
router.get("/:id", protect, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("manager", "name email role")
      .populate("teamMembers", "name email role");

    if (!project) return res.status(404).json({ message: "Project not found" });

    const isMember = project.teamMembers.some(
      (m) => m._id.toString() === req.user._id.toString(),
    );
    const isManager =
      project.manager._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isAdmin && !isManager && !isMember) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this project" });
    }

    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

// PUT /api/projects/:id — update project (admin or assigned PM)
router.put(
  "/:id",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      if (
        req.user.role === "project_manager" &&
        project.manager.toString() !== req.user._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this project" });
      }

      const { title, description, deadline, status } = req.body;
      if (title) project.title = title;
      if (description) project.description = description;
      if (deadline) project.deadline = deadline;
      if (status) project.status = status;

      await project.save();
      await project.populate("manager", "name email");

      // Log activity
      await logActivity(
        req.user._id,
        "project_updated",
        `Updated project "${project.title}"`,
        "project",
        project._id,
      );

      res.json({ success: true, data: project });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/projects/:id — admin can delete any project, PM can delete their own managed projects
router.delete(
  "/:id",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      // PM can only delete projects they manage
      if (
        req.user.role === "project_manager" &&
        project.manager.toString() !== req.user._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to delete this project" });
      }

      // Log activity before deletion
      await logActivity(
        req.user._id,
        "project_deleted",
        `Deleted project "${project.title}"`,
        "project",
        project._id,
      );

      await project.deleteOne();
      res.json({ success: true, message: "Project deleted" });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/projects/:id/members — add members (admin or assigned PM)
// body: { memberIds: ['id1', 'id2'] }
router.post(
  "/:id/members",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      if (
        req.user.role === "project_manager" &&
        project.manager.toString() !== req.user._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to manage this project" });
      }

      const { memberIds } = req.body;
      if (!memberIds || !Array.isArray(memberIds)) {
        return res
          .status(400)
          .json({ message: "memberIds must be an array of user IDs" });
      }

      const addedMembers = [];
      memberIds.forEach((id) => {
        if (!project.teamMembers.includes(id)) {
          project.teamMembers.push(id);
          addedMembers.push(id);
        }
      });

      await project.save();
      await project.populate("teamMembers", "name email role");

      // Log activity for each added member
      const addedUsers = await User.find({ _id: { $in: addedMembers } });
      const memberNames = addedUsers.map((u) => u.name).join(", ");
      await logActivity(
        req.user._id,
        "member_added_to_project",
        `Added ${memberNames} to project "${project.title}"`,
        "project",
        project._id,
      );

      // Notify each newly added member personally
      for (const memberId of addedMembers) {
        await notify({
          userId: memberId,
          type: "project_member_added",
          title: `Added to project: ${project.title}`,
          message: `You've been added to this project by ${req.user.name}`,
          relatedEntityType: "project",
          relatedEntityId: project._id,
        });
      }

      res.json({ success: true, message: "Members added", data: project });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/projects/:id/members/:memberId — remove a member
router.delete(
  "/:id/members/:memberId",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      if (
        req.user.role === "project_manager" &&
        project.manager.toString() !== req.user._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to manage this project" });
      }

      const removedMember = await User.findById(req.params.memberId);

      project.teamMembers = project.teamMembers.filter(
        (m) => m.toString() !== req.params.memberId,
      );

      await project.save();

      // Log activity
      await logActivity(
        req.user._id,
        "member_removed_from_project",
        `Removed ${removedMember?.name || "member"} from project "${project.title}"`,
        "project",
        project._id,
      );

      res.json({ success: true, message: "Member removed", data: project });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/projects/:id/assign-manager — reassign PM (admin only)
// body: { managerId: 'userId' }
router.put(
  "/:id/assign-manager",
  protect,
  restrictTo("admin"),
  async (req, res, next) => {
    try {
      const { managerId } = req.body;
      const project = await Project.findById(req.params.id);
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      const pm = await User.findById(managerId);
      if (!pm || pm.role !== "project_manager") {
        return res
          .status(400)
          .json({ message: "Assigned user must have project_manager role" });
      }

      const oldManager = await User.findById(project.manager);
      project.manager = managerId;
      await project.save();
      await project.populate("manager", "name email role");

      // Log activity
      await logActivity(
        req.user._id,
        "project_updated",
        `Reassigned project "${project.title}" from ${oldManager?.name} to ${pm.name}`,
        "project",
        project._id,
      );

      // Notify the newly assigned PM
      await notify({
        userId: managerId,
        type: "project_created",
        title: `You're now managing: ${project.title}`,
        message: `Admin reassigned this project to you`,
        relatedEntityType: "project",
        relatedEntityId: project._id,
      });

      res.json({
        success: true,
        message: "Project manager updated. All tasks now under new manager.",
        data: project,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/projects/stats/member-projects — all members with their project counts (admin only)
router.get(
  "/stats/member-projects",
  protect,
  restrictTo("admin"),
  async (req, res, next) => {
    try {
      const members = await User.find({ role: "member" }).select(
        "_id name email",
      );

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
        }),
      );

      res.json({ success: true, data: memberStats });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/projects/stats/pm-projects — all PMs with their project counts (admin only)
router.get(
  "/stats/pm-projects",
  protect,
  restrictTo("admin"),
  async (req, res, next) => {
    try {
      const pms = await User.find({ role: "project_manager" }).select(
        "_id name email",
      );

      const pmStats = await Promise.all(
        pms.map(async (pm) => {
          const projectCount = await Project.countDocuments({
            manager: pm._id,
          });
          const pmProjects = await Project.find({ manager: pm._id }).select(
            "_id",
          );
          const projectIds = pmProjects.map((p) => p._id);
          const tasks = await Task.find({
            projectId: { $in: projectIds },
          });
          const completedTasks = tasks.filter(
            (t) => t.status === "Completed",
          ).length;
          return {
            pmId: pm._id,
            pmName: pm.name,
            pmEmail: pm.email,
            projectsManaged: projectCount,
            totalTasks: tasks.length,
            completedTasks,
            completionPercentage:
              tasks.length > 0
                ? Math.round((completedTasks / tasks.length) * 100)
                : 0,
          };
        }),
      );

      res.json({ success: true, data: pmStats });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
