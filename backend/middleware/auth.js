const jwt = require("jsonwebtoken");
const { getStore } = require("../data/store");

function extractToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string" || !authorizationHeader.trim()) {
    return "";
  }

  return authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : authorizationHeader.trim();
}

module.exports = async (req, res, next) => {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getStore().findUserByGymId(decoded.gymId);

    if (!user) {
      return res.status(401).json({ message: "User account no longer exists." });
    }

    if (user.role === "owner" && user.status !== "Active") {
      return res.status(403).json({
        message:
          user.status === "Suspended"
            ? "This gym owner account is suspended. Please contact the administrator."
            : "This gym owner account is not active yet. Please contact the administrator."
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};
