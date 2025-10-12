import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  try {
    // 1. Look for the token in the 'Authorization' header.
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication failed: No token provided." });
    }

    // 2. Extract the token itself (remove "Bearer ").
    const token = authHeader.replace("Bearer ", "");

    // 3. Verify the token is valid using your secret key.
    // Make sure you have JWT_SECRET in your .env file!
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 4. Attach the user's ID from the token to the request object.
    // This is the secure way to know who the user is.
    req.user = { id: decoded.userId }; 

    next(); // All good, proceed to the actual route handler.
  } catch (error) {
    res.status(401).json({ success: false, message: "Authentication failed: Invalid token." });
  }
};

export default auth;