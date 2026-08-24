function errorHandler(err, req, res, next) {
  console.error("[error]", err);

  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return res.status(409).json({
      error: "That slot was just taken by someone else. Please pick another time."
    });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || (status === 500 ? "Something went wrong on our end. Please try again." : err.message)
  });
}

module.exports = errorHandler;
