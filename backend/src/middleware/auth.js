const { verify } = require("../utils/jwt");

function requireAuth(...allowedRoles) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing authentication token." });

    try {
      const payload = verify(token);
      if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
        return res.status(403).json({ error: "You do not have access to this resource." });
      }
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Session expired or invalid. Please log in again." });
    }
  };
}

module.exports = { requireAuth };
