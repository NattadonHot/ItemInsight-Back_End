import mongoose from "mongoose";
import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
import Post from "../models/Post.js";
import auth from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ------------------- 🔹 Cloudinary Helper ------------------- */
function generateUploadSignature(folder, timestamp, apiSecret) {
  const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(stringToSign).digest("hex");
}

function generateDeleteSignature(publicId, timestamp, apiSecret) {
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(stringToSign).digest("hex");
}

async function deleteFromCloudinary(publicId, cloudName, apiKey, apiSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateDeleteSignature(publicId, timestamp, apiSecret);

  const formData = new URLSearchParams();
  formData.append("public_id", publicId);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp.toString());
  formData.append("signature", signature);

  const response = await axios.post(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    formData,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return response.data;
}

/* ------------------- 🔹 Upload to Cloudinary ------------------- */
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

  const response = await axios.post(cloudinaryUrl, formData, {
    headers: formData.getHeaders(),
  });
  return response.data;
}

/* ------------------- 🔹 GET POST BY SLUG ------------------- */
router.get("/slug/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const post = await Post.findOne({ slug }).populate("userId", "username avatarUrl");
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, data: post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});


/* ------------------- 🔹 CREATE POST ------------------- */
router.post("/", auth, upload.array("images"), async (req, res) => {
  try {
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME_POST;
    const API_KEY = process.env.CLOUDINARY_API_KEY_POST;
    const API_SECRET = process.env.CLOUDINARY_API_SECRET_POST;

    const { title, subtitle, blocks, category, productLinks } = req.body;
    const userId = req.user.id;

    const parsedBlocks = typeof blocks === "string" ? JSON.parse(blocks) : blocks || [];
    const parsedLinks = (typeof productLinks === "string" ? JSON.parse(productLinks) : productLinks || []).map(link => ({
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
        if (result) uploadedImages.push({ url: result.secure_url, publicId: result.public_id });
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

/* ------------------- 🔹 DELETE POST ------------------- */
router.delete("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME_POST;
    const API_KEY = process.env.CLOUDINARY_API_KEY_POST;
    const API_SECRET = process.env.CLOUDINARY_API_SECRET_POST;

    // ลบภาพใน Cloudinary
    if (post.images?.length) {
      for (let img of post.images) {
        if (img.publicId) {
          try {
            await deleteFromCloudinary(img.publicId, CLOUD_NAME, API_KEY, API_SECRET);
          } catch (err) {
            console.error(`Failed to delete image ${img.publicId}:`, err.message);
          }
        }
      }
    }

    await Post.findByIdAndDelete(post._id);
    res.json({ success: true, message: "Post deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ------------------- 🔹 GET POSTS ------------------- */
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
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ------------------- 🔹 GET POSTS BY USER ------------------- */
router.get("/user/:userId", async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.userId })
      .populate("userId", "username avatarUrl")
      .sort({ createdAt: -1 });
    res.json({ success: true, data: posts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ------------------- 🔹 GET POST BY ID ------------------- */
router.get("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate("userId", "username avatarUrl");
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ------------------- ❤️ TOGGLE LIKE ------------------- */
router.post("/:id/toggle-like", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    if (!post.likedUsers) post.likedUsers = [];

    const hasLiked = post.likedUsers.includes(userId);
    if (hasLiked) {
      post.likedUsers.pull(userId);
    } else {
      post.likedUsers.push(userId);
    }

    post.likesCount = post.likedUsers.length;
    await post.save();

    res.json({ success: true, liked: !hasLiked, likesCount: post.likesCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ------------------- 🔖 TOGGLE BOOKMARK ------------------- */
router.post("/:id/toggle-bookmark", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    if (!post.bookmarkedUsers) post.bookmarkedUsers = [];

    const hasBookmarked = post.bookmarkedUsers.includes(userId);
    if (hasBookmarked) {
      post.bookmarkedUsers.pull(userId);
    } else {
      post.bookmarkedUsers.push(userId);
    }

    await post.save();
    res.json({ success: true, bookmarked: !hasBookmarked });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ------------------- 📚 GET USER BOOKMARKS ------------------- */
router.get("/bookmarks/:userId", async (req, res) => {
  try {
    const posts = await Post.find({ bookmarkedUsers: req.params.userId })
      .populate("userId", "username avatarUrl")
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------- 💬 GET COMMENTS BY POST ------------------- */
router.get("/:id/comments", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).lean(); // lean() ให้เป็น plain object
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    // ดึง user ของแต่ละ comment
    const User = await import("../models/User.js").then(m => m.default);

    const commentsWithUser = await Promise.all(
      post.comments.map(async (c) => {
        const user = await User.findById(c.userId).select("username avatarUrl");
        return {
          _id: c._id,
          userId: c.userId,
          username: user?.username || c.username,
          avatarUrl: user?.avatarUrl || "https://placehold.co/40x40",
          text: c.text,
          createdAt: c.createdAt,
        };
      })
    );

    res.json({ success: true, comments: commentsWithUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ------------------- 💬 ADD COMMENT ------------------- */
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) 
      return res.status(400).json({ success: false, message: "Comment text is required" });

    const post = await Post.findById(req.params.id);
    if (!post) 
      return res.status(404).json({ success: false, message: "Post not found" });

    const newComment = {
      _id: new mongoose.Types.ObjectId(), // 🔑 ใส่ _id เองก่อน push
      userId: req.user.id,
      username: req.user.username || "Anonymous",
      text,
      createdAt: new Date(),
    };

    post.comments.push(newComment);
    post.commentsCount = post.comments.length;
    await post.save();

    // ส่ง comment กลับไปให้ frontend
    res.json({ success: true, comment: newComment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


/* ------------------- 💬 EDIT COMMENT ------------------- */
router.put("/:postId/comments/:commentId", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: "Comment text is required" });

    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

    if (comment.userId.toString() !== req.user.id)
      return res.status(403).json({ success: false, message: "Forbidden" });

    comment.text = text;
    await post.save();

    res.json({ success: true, comment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ------------------- 💬 DELETE COMMENT ------------------- */
router.delete("/:postId/comments/:commentId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

    if (comment.userId.toString() !== req.user.id)
      return res.status(403).json({ success: false, message: "Forbidden" });

    // ✅ ใช้ pull() ลบ subdocument
    post.comments.pull({ _id: req.params.commentId });
    post.commentsCount = post.comments.length;

    await post.save();

    res.json({ success: true, message: "Comment deleted", commentsCount: post.commentsCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});


export default router;