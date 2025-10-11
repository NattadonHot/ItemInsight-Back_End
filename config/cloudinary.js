import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME_POST,
  api_key: process.env.CLOUDINARY_CLOUD_KEY_POST,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET_POST,
});

export default cloudinary;
