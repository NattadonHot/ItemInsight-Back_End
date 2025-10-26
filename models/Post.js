import mongoose from "mongoose";
import slugify from "slugify";

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true } // ให้ MongoDB สร้าง _id ของ comment อัตโนมัติ
);

const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    subtitle: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    blocks: [
      {
        id: { type: String, required: true },
        type: { type: String, enum: ["paragraph", "header", "image"], required: true },
        data: { type: mongoose.Schema.Types.Mixed, required: true },
      },
    ],
    images: [
      { url: { type: String, required: true }, publicId: { type: String, required: true } },
    ],
    productLinks: [
      { name: { type: String, required: true }, url: { type: String, required: true } },
    ],

    likesCount: { type: Number, default: 0 },
    likedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    bookmarkedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ---------- ระบบ Comment ----------
    comments: [commentSchema],
    commentsCount: { type: Number, default: 0 },

    category: {
      type: String,
      enum: ["tech", "fashion", "food", "lifestyle", "beauty", "travel", "other"],
      default: "other",
    },
  },
  { timestamps: true }
);

// สร้าง slug อัตโนมัติ
postSchema.pre("save", async function (next) {
  if (this.isModified("title")) {
    let slug = slugify(this.title, { lower: true, strict: true });

    const existingPost = await mongoose.models.Post.findOne({ slug });
    if (existingPost && existingPost._id.toString() !== this._id.toString()) {
      slug = `${slug}-${Date.now()}`;
    }

    this.slug = slug;
  }
  next();
});

// Indexes
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ slug: 1 });
postSchema.index({ category: 1, createdAt: -1 });

const Post = mongoose.model("Post", postSchema, "posts");
export default Post;
