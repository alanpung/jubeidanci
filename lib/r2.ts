import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const accountId = process.env.R2_ACCOUNT_ID || "dummy-account";
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || "dummy-access-key";
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "dummy-secret-key";

    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3Client;
}

export async function uploadAudio(key: string, buffer: Buffer, contentType = "audio/mpeg") {
  try {
    if (!process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID === "dummy-access-key") {
      return;
    }
    const s3 = getS3Client();
    const bucket = process.env.R2_BUCKET_NAME || "openlingo";
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
  } catch (err) {
    console.warn("Cloudflare R2 audio upload skipped or failed:", err);
  }
}

export async function getAudio(key: string): Promise<Buffer | null> {
  try {
    const s3 = getS3Client();
    const bucket = process.env.R2_BUCKET_NAME || "openlingo";
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
  }
}

export function getPublicUrl(key: string): string {
  return `/api/tts?key=${encodeURIComponent(key)}`;
}
