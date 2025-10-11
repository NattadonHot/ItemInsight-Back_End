import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "../config/cloudinary.js";

const storage = multer.memoryStorage();
export const uploadMiddleware = multer({ storage }).single("image");

// helper: upload buffer to cloudinary
export const uploadBufferToCloudinary = (buffer, folder = "blog") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};
