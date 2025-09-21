import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CFG } from './config';

const s3 = new S3Client({ region: CFG.AWS_S3_REGION });

export async function publish(obj: any) {
  await s3.send(new PutObjectCommand({
    Bucket: CFG.AWS_S3_BUCKET, Key: 'last-seen.json',
    Body: JSON.stringify(obj, null, 2),
    ContentType: 'application/json', ACL:'public-read'
  }));
}
