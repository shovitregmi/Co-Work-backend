const express = require("express");
const User = require("../models/user");
const Project = require("../models/project");
const { protect } = require("../middleware/auth");
const { restrictTo } = require("../middleware/role");
const notify = require("../utils/notify");

const router = express.Router();

// GET /api/users — admin sees all users, PM sees all non-admin users
router.get(
  "/",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      let users;

      if (req.user.role === "admin") {
        users = await User.find().select("-password").sort({ createdAt: -1 });
      } else {
        users = await User.find({ role: { $ne: "admin" } })
          .select("-password")
          .sort({ createdAt: -1 });
      }

      res.json({ success: true, count: users.length, data: users });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/users/:id — admin or PM can look up a single user
router.get(
  "/:id",
  protect,
  restrictTo("admin", "project_manager"),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id).select("-password");
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/users/:id/promote — member → project_manager (admin only)
router.put(
  "/:id/promote",
  protect,
  restrictTo("admin"),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role === "admin") {
        return res
          .status(400)
          .json({ message: "Cannot change an admin's role" });
      }

      user.role = "project_manager";
      await user.save();

      await notify({
        userId: user._id,
        type: "user_promoted",
        title: "You were promoted to Project Manager",
        message: "You can now create and manage projects",
        relatedEntityType: "user",
        relatedEntityId: user._id,
      });

      res.json({
        success: true,
        message: `${user.name} promoted to Project Manager`,
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/users/:id/demote — project_manager → member (admin only)
// All projects managed by this PM get reassigned to admin as a placeholder
router.put(
  "/:id/demote",
  protect,
  restrictTo("admin"),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role === "admin") {
        return res
          .status(400)
          .json({ message: "Cannot change an admin's role" });
      }
      if (user.role === "member") {
        return res.status(400).json({ message: "User is already a member" });
      }

      // Find the admin who is demoting (they become the placeholder manager)
      const admin = req.user;

      // Reassign all projects managed by this PM to the admin
      const projectsToReassign = await Project.find({ manager: user._id });
      if (projectsToReassign.length > 0) {
        await Project.updateMany({ manager: user._id }, { manager: admin._id });

        // Notify admin they now temporarily manage these projects
        await notify({
          userId: admin._id,
          type: "project_created",
          title: `You are now managing ${projectsToReassign.length} project(s)`,
          message: `${user.name} was demoted — their projects were reassigned to you until a new PM is set`,
          relatedEntityType: "user",
          relatedEntityId: user._id,
        });
      }

      user.role = "member";
      await user.save();

      await notify({
        userId: user._id,
        type: "user_promoted",
        title: "Your role was changed to Member",
        message: "Your managed projects have been reassigned to Admin",
        relatedEntityType: "user",
        relatedEntityId: user._id,
      });

      res.json({
        success: true,
        message: `${user.name} demoted to Member. ${projectsToReassign.length} project(s) reassigned to Admin.`,
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        reassignedProjects: projectsToReassign.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/users/:id/availability — toggle availability
// Admin can change anyone's, user can change their own
router.put("/:id/availability", protect, async (req, res, next) => {
  try {
    const { availability } = req.body;

    if (!["available", "not_available"].includes(availability)) {
      return res.status(400).json({
        message: 'availability must be "available" or "not_available"',
      });
    }

    const isAdmin = req.user.role === "admin";
    const isSelf = req.params.id === req.user._id.toString();

    if (!isAdmin && !isSelf) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this user" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.availability = availability;
    await user.save();

    res.json({
      success: true,
      message: `Availability updated to ${availability}`,
      data: { id: user._id, name: user.name, availability: user.availability },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id — edit name/email (admin only)
router.put("/:id", protect, restrictTo("admin"), async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    if (name) user.name = name;
    await user.save();

    res.json({
      success: true,
      message: "User updated",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id — admin only, cannot delete self
router.delete("/:id", protect, restrictTo("admin"), async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot delete your own account" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    await user.deleteOne();
    res.json({ success: true, message: `${user.name} has been deleted` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
