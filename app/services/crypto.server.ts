import crypto from "crypto";

/**
 * Derives a 32-byte encryption key from the server secret.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.SHOPIFY_API_SECRET || process.env.ENCRYPTION_SECRET || "restockping-default-secure-key-32-chars-min!";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (hex-encoded).
 */
export function encryptCredential(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts an AES-256-GCM encrypted credential string.
 */
export function decryptCredential(encryptedText?: string | null): string {
  if (!encryptedText) return "";
  const parts = encryptedText.split(":");
  if (parts.length !== 3) return "";

  const [ivHex, authTagHex, ciphertextHex] = parts;
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("[Credential Decryption Error]: Failed to decrypt credential");
    return "";
  }
}
