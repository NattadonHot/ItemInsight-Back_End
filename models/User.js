import mongoose from "mongoose";

const DEFAULT_AVATAR =
  "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatarUrl: { type: String, default: DEFAULT_AVATAR },
    avatarPublicId: { type: String, default: null },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema, "users");
export default User;