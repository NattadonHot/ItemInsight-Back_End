import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
import mongoose from "mongoose";
import Post from "../models/Post.js";
import auth from "../middleware/auth.js"; // 🔑 Import the middleware

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- Cloudinary helper functions ---
function generateUploadSignature(folder, timestamp, apiSecret) {
  const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(stringToSign).digest("hex");
}
function generateDeleteSignature(publicId, timestamp, apiSecret) {
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(stringToSign).digest("hex");
}
async function deleteFromCloudinary(publicId, cloudName, apiKey, apiSecret) {
  // ... implementation ...
}

// ✅ ฟังก์ชันอัปโหลดรูปภาพ
async function uploadToCloudinary(fileBuffer, fileName, folder, cloudName, apiKey, apiSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateUploadSignature(folder, timestamp, apiSecret);

  const formData = new FormData();
  formData.append("file", fileBuffer, { filename: fileName });
  formData.append("folder", folder);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp.toString());
  formData.append("signature", signature);

  const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  try {
    const response = await axios.post(cloudinaryUrl, formData, {
      headers: formData.getHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("❌ ERROR uploading to Cloudinary:", error.response?.data || error.message);
    return undefined;
  }
}

// ✅ POST /api/posts — Create new post (secured)
router.post("/", auth, upload.array("images"), async (req, res) => {
  try {
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME_POST;
    const API_KEY = process.env.CLOUDINARY_API_KEY_POST;
    const API_SECRET = process.env.CLOUDINARY_API_SECRET_POST;

    const { title, subtitle, blocks, category, productLinks } = req.body;
    const userId = req.user.id;

    const parsedBlocks = typeof blocks === "string" ? JSON.parse(blocks) : blocks || [];
    const parsedLinks = (
      typeof productLinks === "string" ? JSON.parse(productLinks) : productLinks || []
    ).map((link) => ({
      name: link.name || "Unnamed product",
      url: link.url || "",
    }));

    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        const result = await uploadToCloudinary(
          file.buffer,
          file.originalname,
          "blog/posts",
          CLOUD_NAME,
          API_KEY,
          API_SECRET
        );
        console.log("Cloudinary Response:", result);
        uploadedImages.push({ url: result.secure_url, publicId: result.public_id });
      }
    }

    const newPost = new Post({
      userId,
      title,
      subtitle,
      blocks: parsedBlocks,
      images: uploadedImages,
      productLinks: parsedLinks,
      category: category || "other",
    });

    await newPost.save();
    res.status(201).json({ success: true, post: newPost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ DELETE /api/posts/:id — Delete post
router.delete("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You are not authorized to delete this post." });
    }

    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME_POST;
    // ... delete from cloudinary logic ...

    await Post.findByIdAndDelete(post._id);
    res.json({ success: true, message: "Post deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ GET /api/posts — Get all posts
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (search) filter.title = { $regex: search, $options: "i" };

    const posts = await Post.find(filter)
      .populate("userId", "username avatarUrl")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Post.countDocuments(filter);
    res.json({ success: true, data: posts, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ GET /api/posts/:id — Get single post by ID
router.get("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate("userId", "username avatarUrl");

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    res.json({ success: true, data: post });
  } catch (err) {
    console.error("Error fetching post:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// (Optional) สำหรับ slug ในอนาคต
// router.get("/slug/:slug", async (req, res) => { ... });

// (Optional) สำหรับ upload image แยก
// router.post("/upload-image", auth, upload.single("image"), async (req, res) => { ... });

export default router;
