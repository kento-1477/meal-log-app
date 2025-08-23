const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');

const s3 = new S3Client({
  region: process.env.STORAGE_REGION || 'us-east-1',
  endpoint: process.env.STORAGE_ENDPOINT || undefined,
  forcePathStyle: !!process.env.STORAGE_ENDPOINT, // R2 等で必要
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
    secretAccessKey: process.env.STORAGE_SECRET || '',
  },
});

async function put(buffer, mime) {
  const Key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key,
      Body: buffer,
      ContentType: mime || 'application/octet-stream',
      ACL: 'public-read', // ポリシーに応じて変更
    }),
  );

  const base = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, '');
  return `${base}/${Key}`;
}

module.exports = { put };
