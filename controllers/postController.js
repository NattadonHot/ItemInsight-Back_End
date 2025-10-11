import Post from "../models/Post.js"; // ใช้ schema ของคุณ (ปรับถ้าจำเป็น)
import { uploadBufferToCloudinary } from "../middlewares/upload.js";

// create post (รับ JSON blocks; client อาจส่งรูปผ่าน multipart หรือ image เป็น URL)
export const createPost = async (req, res) => {
  try {
    // ถ้ามีไฟล์ภาพที่ส่งมาพร้อม multipart (ชื่อ field: image) -> upload
    let imageInfo;
    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, "blog/posts");
      imageInfo = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }

    // body ต้องมี: title, subtitle, blocks (array), productLinks, category
    const { title, subtitle, blocks = [], productLinks = [], category } = req.body;

    // blocks อาจเป็น stringified JSON ถ้า client ส่งแบบ form-data
    let parsedBlocks = blocks;
    if (typeof blocks === "string") parsedBlocks = JSON.parse(blocks);

    // ถ้า client ส่งภาพภายใน block เป็นไฟล์แยก (เช่น image block มี image upload) — โค้ดนี้รองรับกรณีทั่วไปที่ client ส่ง URL แล้ว
    const newPost = new Post({
      userId: req.body.userId || null,
      title,
      subtitle,
      blocks: parsedBlocks,
      productLinks: typeof productLinks === "string" ? JSON.parse(productLinks) : productLinks,
      images: imageInfo ? [imageInfo] : [],
      category: category || "other",
    });

    await newPost.save();
    res.status(201).json({ success: true, post: newPost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const uploadImage = async (req, res) => {
  // endpoint แยกสำหรับอัพรูป (ใช้โดย Editor.js image tool)
  try {
    if (!req.file) return res.status(400).json({ message: "No file" });
    const result = await uploadBufferToCloudinary(req.file.buffer, "blog/editor-images");
    res.json({ success: true, url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (search) filter.title = { $regex: search, $options: "i" };

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("title subtitle slug images category createdAt likesCount commentsCount");

    const total = await Post.countDocuments(filter);
    res.json({ success: true, data: posts, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getPostBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const post = await Post.findOne({ slug });
    if (!post) return res.status(404).json({ message: "Not found" });
    res.json({ success: true, post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};
