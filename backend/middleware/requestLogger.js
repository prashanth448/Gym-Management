function shouldLogRequest(pathname) {
  return !pathname.startsWith("/api/health");
}

module.exports = function requestLogger(req, res, next) {
  if (!shouldLogRequest(req.path)) {
    next();
    return;
  }

  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`
    );
  });

  next();
};
