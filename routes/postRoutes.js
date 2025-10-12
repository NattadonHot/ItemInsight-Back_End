import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
import Post from "../models/Post.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ฟังก์ชันสร้าง signature สำหรับ upload
function generateUploadSignature(folder, timestamp, apiSecret) {
  const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(stringToSign).digest("hex");
}

// ฟังก์ชันสร้าง signature สำหรับลบ
function generateDeleteSignature(publicId, timestamp, apiSecret) {
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(stringToSign).digest("hex");
}

// ลบรูปจาก Cloudinary
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

// upload image ไป Cloudinary
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

// POST /api/posts — สร้างโพสต์ใหม่
router.post("/", upload.array("images"), async (req, res) => {
  try {
    const { title, subtitle, blocks, category, productLinks, userId } = req.body;

    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME_POST;
    const API_KEY = process.env.CLOUDINARY_API_KEY_POST;
    const API_SECRET = process.env.CLOUDINARY_API_SECRET_POST;

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return res.status(500).json({ message: "Cloudinary credentials missing" });
    }

    let parsedBlocks = typeof blocks === "string" ? JSON.parse(blocks) : blocks || [];
    let parsedLinks = typeof productLinks === "string" ? JSON.parse(productLinks) : productLinks || [];

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

// POST /api/posts/upload-image — upload image แยก (Editor.js)
router.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME_POST;
    const API_KEY = process.env.CLOUDINARY_API_KEY_POST;
    const API_SECRET = process.env.CLOUDINARY_API_SECRET_POST;

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const result = await uploadToCloudinary(
      req.file.buffer,
      req.file.originalname,
      "blog/editor-images",
      CLOUD_NAME,
      API_KEY,
      API_SECRET
    );

    res.json({ success: true, url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/posts — ดึงโพสต์ทั้งหมด
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (search) filter.title = { $regex: search, $options: "i" };

    const posts = await Post.find(filter)
      .populate('userId', 'username avatarUrl') // ⭐ แก้เป็น avatarUrl
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

// GET /api/posts/:slug — ดึงโพสต์ตาม slug
router.get("/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug })
      .populate('userId', 'username profileImage'); // ⭐ เพิ่มบรรทัดนี้
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/posts/:id — ลบโพสต์ + ลบรูปใน Cloudinary
router.delete("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
    const API_KEY = process.env.CLOUDINARY_API_KEY;
    const API_SECRET = process.env.CLOUDINARY_API_SECRET;

    for (let img of post.images || []) {
      try {
        await deleteFromCloudinary(img.publicId, CLOUD_NAME, API_KEY, API_SECRET);
      } catch (err) {
        console.warn("Failed to delete image:", img.publicId, err.message);
      }
    }

    await Post.findByIdAndDelete(post._id);
    res.json({ success: true, message: "Post deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;