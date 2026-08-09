// Usage: restrictTo('admin') or restrictTo('admin', 'project_manager')
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Not authorized for this action" });
    }
    next();
  };
};

module.exports = { restrictTo };
