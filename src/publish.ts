import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CFG } from './config';

// ✅ Ensure region is set correctly; fall back to env var or us-east-2
const s3 = new S3Client({
  region: CFG.AWS_S3_REGION || process.env.AWS_S3_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function publish(obj: any) {
  await s3.send(
    new PutObjectCommand({
      Bucket: CFG.AWS_S3_BUCKET,
      Key: 'last-seen.json',
      Body: JSON.stringify(obj, null, 2),
      ContentType: 'application/json',
    })
  );

  // ✅ Optional: log the public URL for quick verification
  const region = CFG.AWS_S3_REGION || process.env.AWS_S3_REGION || 'us-east-2';
  console.log(
    `Published to https://${CFG.AWS_S3_BUCKET}.s3.${region}.amazonaws.com/last-seen.json`
  );
}
