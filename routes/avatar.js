import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
import User from "../models/User.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ฟังก์ชันสำหรับสร้าง signature สำหรับการลบ
function generateDeleteSignature(publicId, timestamp, apiSecret) {
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(stringToSign).digest("hex");
}

// ฟังก์ชันสำหรับสร้าง signature สำหรับการ upload
function generateUploadSignature(folder, timestamp, apiSecret) {
  const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(stringToSign).digest("hex");
}

// ฟังก์ชันสำหรับลบรูปจาก Cloudinary
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

// PUT /api/avatar/:id
router.put("/:id", upload.single("avatar"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    console.log("\n=== START AVATAR UPDATE ===");
    console.log("User ID:", req.params.id);
    console.log("Current avatarUrl:", user.avatarUrl);
    console.log("Current avatarPublicId:", user.avatarPublicId);

    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
    const API_KEY = process.env.CLOUDINARY_API_KEY;
    const API_SECRET = process.env.CLOUDINARY_API_SECRET;

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      console.error("❌ Missing Cloudinary credentials!");
      return res.status(500).json({ message: "Cloudinary credentials missing" });
    }

    // ลบรูปเก่า ถ้ามี
    if (user.avatarPublicId) {
      console.log("🗑️  Attempting to delete old avatar:", user.avatarPublicId);
      try {
        const deleteResult = await deleteFromCloudinary(
          user.avatarPublicId,
          CLOUD_NAME,
          API_KEY,
          API_SECRET
        );
        console.log("✅ Delete result:", JSON.stringify(deleteResult, null, 2));
        
        if (deleteResult.result === "ok") {
          console.log("✅ Old avatar deleted successfully");
        } else if (deleteResult.result === "not found") {
          console.log("⚠️  Old avatar not found in Cloudinary");
        } else {
          console.log("⚠️  Unexpected delete result:", deleteResult);
        }
      } catch (err) {
        console.error("❌ Error deleting old avatar:");
        console.error("   Message:", err.message);
        console.error("   Response:", err.response?.data);
        console.error("   Status:", err.response?.status);
      }
    } else {
      console.log("ℹ️  No avatarPublicId found, skipping deletion");
    }

    // Upload ไฟล์ใหม่
    console.log("⬆️  Uploading new avatar...");
    const folder = "profile"; // กำหนด folder ที่ต้องการ
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateUploadSignature(folder, timestamp, API_SECRET);

    const formData = new FormData();
    formData.append("file", req.file.buffer, { filename: req.file.originalname });
    formData.append("folder", folder); // เพิ่ม folder parameter
    formData.append("api_key", API_KEY);
    formData.append("timestamp", timestamp.toString());
    formData.append("signature", signature);

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    const response = await axios.post(cloudinaryUrl, formData, {
      headers: formData.getHeaders(),
    });

    console.log("✅ New upload successful:");
    console.log("   New avatarUrl:", response.data.secure_url);
    console.log("   New avatarPublicId:", response.data.public_id);

    // บันทึก avatarUrl + public_id ใน DB
    user.avatarUrl = response.data.secure_url;
    user.avatarPublicId = response.data.public_id;
    await user.save();

    console.log("✅ User saved to database");
    console.log("=== END AVATAR UPDATE ===\n");

    res.json({ 
      avatarUrl: user.avatarUrl,
      message: "Avatar updated successfully"
    });
  } catch (err) {
    console.error("\n❌ UPLOAD ERROR:");
    console.error("   Message:", err.message);
    console.error("   Response:", err.response?.data);
    console.error("   Stack:", err.stack);
    console.error("=== END WITH ERROR ===\n");
    
    res.status(500).json({ 
      message: "Upload failed", 
      error: err.response?.data || err.message 
    });
  }
});

export default router;