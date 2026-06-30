const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Resource not found' });
  }

  // Mongoose duplicate key (e.g. email already exists)
  if (err.code === 11000) {
    return res.status(400).json({ message: 'Email already in use' });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({ message: message.join(', ') });
  }

  res.status(err.statusCode || 500).json({
    message: err.message || 'Server Error',
  });
};

module.exports = errorHandler;