const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Project title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teamMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      enum: ["planning", "active", "completed"],
      default: "planning",
    },
    deadline: {
      type: Date,
    },
  },
  { timestamps: true },
);
module.exports =
  mongoose.models.Project || mongoose.model("Project", projectSchema);
