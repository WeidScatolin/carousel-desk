import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadedImage {
  url: string;
  publicId: string;
}

export async function uploadSlideImage(buffer: Buffer, publicId: string): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: 'carousel-desk/slides', resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('uploadSlideImage: no result returned from Cloudinary'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteSlideImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
