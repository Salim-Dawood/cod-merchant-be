const cloudinary = require('cloudinary').v2;

const {
  CLOUDINARY_URL,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET
} = process.env;

const isCloudinaryEnabled = Boolean(
  CLOUDINARY_URL || (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)
);

if (CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
} else if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
}

function uploadImageBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'cod-merchant',
        resource_type: 'image',
        ...options
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

module.exports = {
  uploadImageBuffer,
  isCloudinaryEnabled
};
