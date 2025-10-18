import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
import Post from "../models/Post.js";
import auth from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// -------------------- Cloudinary --------------------
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
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  return response.data;
}

// -------------------- CREATE POST --------------------
router.post("/", auth, upload.array("images"), async (req, res) => {
  try {
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME_POST;
    const API_KEY = process.env.CLOUDINARY_API_KEY_POST;
    const API_SECRET = process.env.CLOUDINARY_API_SECRET_POST;

    const { title, subtitle, blocks, category, productLinks, slug } = req.body;
    const userId = req.user.id;

    const parsedBlocks = typeof blocks === "string" ? JSON.parse(blocks) : blocks || [];
    const parsedLinks = (typeof productLinks === "string" ? JSON.parse(productLinks) : productLinks || [])
      .map(link => ({ name: link.name || "Unnamed product", url: link.url || "" }));

    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const folder = "blog/posts";
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = generateUploadSignature(folder, timestamp, API_SECRET);

        const formData = new FormData();
        formData.append("file", file.buffer, { filename: file.originalname });
        formData.append("folder", folder);
        formData.append("api_key", API_KEY);
        formData.append("timestamp", timestamp.toString());
        formData.append("signature", signature);

        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
        const response = await axios.post(cloudinaryUrl, formData, { headers: formData.getHeaders() });

        uploadedImages.push({ url: response.data.secure_url, public_id: response.data.public_id });
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
      slug: slug || title.toLowerCase().replace(/\s+/g, "-"),
    });

    await newPost.save();
    res.status(201).json({ success: true, post: newPost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------- DELETE POST --------------------
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

    // ลบรูปทุกภาพจาก Cloudinary
    if (post.images && post.images.length > 0) {
      for (const img of post.images) {
        if (img.public_id) {
          try {
            const result = await deleteFromCloudinary(img.public_id, CLOUD_NAME, API_KEY, API_SECRET);
            console.log(`Deleted image ${img.public_id}: ${result.result}`);
          } catch (err) {
            console.error(`Error deleting Cloudinary image ${img.public_id}:`, err.message);
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

// -------------------- GET POSTS --------------------
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

// -------------------- GET POST BY ID --------------------
router.get("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate("userId", "username avatarUrl");
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, data: post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ GET /api/posts/user/:id — Get posts by userId
router.get("/user/:id", auth, async (req, res) => {
  try {
    const userId = req.params.id;
    const posts = await Post.find({ userId })
      .populate("userId", "username avatarUrl")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: posts });
  } catch (err) {
    console.error("Error fetching user posts:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// (Optional) สำหรับ slug ในอนาคต
// router.get("/slug/:slug", async (req, res) => { ... });

// (Optional) สำหรับ upload image แยก
// router.post("/upload-image", auth, upload.single("image"), async (req, res) => { ... });
// -------------------- GET POST BY SLUG --------------------
router.get("/slug/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug }).populate("userId", "username avatarUrl");
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, data: post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
