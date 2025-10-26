import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication failed: No token provided." });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ เพิ่ม username จาก token
    req.user = { id: decoded.userId, username: decoded.username };

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Authentication failed: Invalid token." });
  }
};

export default auth;
