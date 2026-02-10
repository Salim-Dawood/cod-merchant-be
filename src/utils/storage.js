const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { uploadImageBuffer, isCloudinaryEnabled } = require('./cloudinary');

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_BUCKET
} = process.env;

const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_BUCKET);

let supabaseClient = null;
if (isSupabaseEnabled) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'cod-merchant' } }
  });
}

function guessExtension(filename = '', mimetype = '') {
  const ext = path.extname(filename).toLowerCase();
  if (ext) {
    return ext;
  }
  if (mimetype === 'image/png') {
    return '.png';
  }
  if (mimetype === 'image/webp') {
    return '.webp';
  }
  if (mimetype === 'image/gif') {
    return '.gif';
  }
  return '.jpg';
}

async function uploadImage({ buffer, filename, mimetype, prefix }) {
  if (isSupabaseEnabled && supabaseClient) {
    const ext = guessExtension(filename, mimetype);
    const safePrefix = prefix ? String(prefix).replace(/[^a-zA-Z0-9_-]+/g, '-') : 'image';
    const key = `uploads/${safePrefix}-${Date.now()}${ext}`;
    const { error } = await supabaseClient.storage
      .from(SUPABASE_BUCKET)
      .upload(key, buffer, {
        contentType: mimetype || 'image/jpeg',
        upsert: true
      });
    if (error) {
      throw error;
    }
    const { data } = supabaseClient.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
    if (!data?.publicUrl) {
      throw new Error('Failed to resolve public URL');
    }
    return data.publicUrl;
  }

  if (isCloudinaryEnabled) {
    const resultUpload = await uploadImageBuffer(buffer, {
      public_id: `${prefix || 'image'}-${Date.now()}`
    });
    const url = resultUpload?.secure_url || resultUpload?.url;
    if (!url) {
      throw new Error('Upload failed');
    }
    return url;
  }

  return '';
}

module.exports = {
  uploadImage,
  isCloudinaryEnabled,
  isSupabaseEnabled
};
