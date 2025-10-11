import mongoose from "mongoose";
import slugify from "slugify";

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
    // เก็บ content เป็น blocks แบบ Editor.js
    blocks: [
      {
        id: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ["paragraph", "header", "image"],
          required: true,
        },
        data: {
          type: mongoose.Schema.Types.Mixed, // ยืดหยุ่น รองรับทุก type
          required: true,
        },
      },
    ],
    // เก็บรูปภาพทั้งหมดไว้ reference (สำหรับลบ)
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
      },
    ],
    // Product Links แยกต่างหาก
    productLinks: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      enum: ["tech", "fashion", "food", "lifestyle", "beauty", "travel", "other"],
      default: "other",
    },
  },
  {
    timestamps: true,
  }
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

// Index
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ slug: 1 });
postSchema.index({ category: 1, status: 1, createdAt: -1 });
postSchema.index({ status: 1, createdAt: -1 });

const Post = mongoose.model("Post", postSchema, "posts");
export default Post;