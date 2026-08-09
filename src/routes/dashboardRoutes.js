const express = require("express");
const User = require("../models/user");
const Project = require("../models/project");
const Task = require("../models/Task");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/dashboard/summary — role-aware stats
router.get("/summary", protect, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    if (role === "admin") {
      const [
        totalUsers,
        totalProjects,
        totalTasks,
        completedTasks,
        pendingTasks,
        members,
        pms,
      ] = await Promise.all([
        User.countDocuments(),
        Project.countDocuments(),
        Task.countDocuments(),
        Task.countDocuments({ status: "Completed" }),
        Task.countDocuments({ status: { $in: ["To Do", "In Progress"] } }),
        User.countDocuments({ role: "member" }),
        User.countDocuments({ role: "project_manager" }),
      ]);

      return res.json({
        success: true,
        data: {
          totalUsers,
          totalProjects,
          totalTasks,
          completedTasks,
          pendingTasks,
          members,
          projectManagers: pms,
        },
      });
    }

    if (role === "project_manager") {
      const myProjects = await Project.find({ manager: userId }).select("_id");
      const projectIds = myProjects.map((p) => p._id);

      const [
        totalProjects,
        totalTasks,
        completedTasks,
        pendingTasks,
        inProgressTasks,
      ] = await Promise.all([
        Project.countDocuments({ manager: userId }),
        Task.countDocuments({ projectId: { $in: projectIds } }),
        Task.countDocuments({
          projectId: { $in: projectIds },
          status: "Completed",
        }),
        Task.countDocuments({
          projectId: { $in: projectIds },
          status: "To Do",
        }),
        Task.countDocuments({
          projectId: { $in: projectIds },
          status: "In Progress",
        }),
      ]);

      return res.json({
        success: true,
        data: {
          totalProjects,
          totalTasks,
          completedTasks,
          pendingTasks,
          inProgressTasks,
        },
      });
    }

    // Member
    const [totalTasks, completedTasks, pendingTasks, inProgressTasks] =
      await Promise.all([
        Task.countDocuments({ assignedTo: userId }),
        Task.countDocuments({ assignedTo: userId, status: "Completed" }),
        Task.countDocuments({ assignedTo: userId, status: "To Do" }),
        Task.countDocuments({ assignedTo: userId, status: "In Progress" }),
      ]);

    const myProjects = await Project.find({ teamMembers: userId })
      .select("title status deadline")
      .populate("manager", "name");

    return res.json({
      success: true,
      data: {
        totalTasks,
        completedTasks,
        pendingTasks,
        inProgressTasks,
        projects: myProjects,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
