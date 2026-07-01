const express = require('express');
const Project = require('../models/Project');
const { protect } = require('../middleware/auth');
const { restrictTo } = require('../middleware/role');
const router = express.Router();

// 1. Create a Project (Only Managers and Admins can create)
router.post('/', protect, restrictTo('project_manager', 'admin'), async (req, res, next) => {
  try {
    const { title, description, deadline } = req.body;
    
    const project = await Project.create({
      title,
      description,
      deadline,
      manager: req.user._id, // Automatically assign the logged-in user as the manager
    });

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

// 2. Get All Projects (Admins see everything, Managers/Members see only what they belong to)
router.get('/', protect, async (req, res, next) => {
  try {
    let projects;
    
    if (req.user.role === 'admin') {
      projects = await Project.find().populate('manager', 'name email');
    } else {
      // Find projects where user is either the manager OR a team member
      projects = await Project.find({
        $or: [{ manager: req.user._id }, { teamMembers: req.user._id }],
      }).populate('manager', 'name email');
    }

    res.json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    next(error);
  }
});

module.exports = router;