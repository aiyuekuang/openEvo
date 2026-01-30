/**
 * 飞书消息加密解密
 * Feishu Message Encryption/Decryption
 *
 * 飞书使用 AES-256-CBC 加密，密钥通过 SHA256 hash 生成
 */

import crypto from "crypto";

/**
 * 从 Encrypt Key 生成 AES 密钥
 * 飞书使用 SHA256(encryptKey) 作为 AES 密钥
 */
function getAesKey(encryptKey: string): Buffer {
  return crypto.createHash("sha256").update(encryptKey).digest();
}

/**
 * 解密消息
 */
export function decryptMessage(
  encryptedMsg: string,
  encryptKey: string
): string {
  // 从 encrypt key 生成 AES 密钥
  const aesKey = getAesKey(encryptKey);

  // Base64 解码加密消息
  const encryptedBuffer = Buffer.from(encryptedMsg, "base64");

  // IV 是加密数据的前 16 字节
  const iv = encryptedBuffer.subarray(0, 16);
  const encrypted = encryptedBuffer.subarray(16);

  // AES-256-CBC 解密
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);

  let decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}

/**
 * 加密消息 (用于响应)
 */
export function encryptMessage(
  message: string,
  encryptKey: string
): string {
  // 从 encrypt key 生成 AES 密钥
  const aesKey = getAesKey(encryptKey);

  // 生成随机 IV (16 字节)
  const iv = crypto.randomBytes(16);

  // AES-256-CBC 加密
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(message, "utf-8"),
    cipher.final(),
  ]);

  // 拼接 IV + 加密数据，然后 Base64 编码
  return Buffer.concat([iv, encrypted]).toString("base64");
}

/**
 * 计算签名 (用于验证 Webhook 请求)
 * 签名算法: SHA256(timestamp + nonce + encryptKey + body)
 */
export function calculateSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  body: string
): string {
  const content = timestamp + nonce + encryptKey + body;
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * 验证签名
 */
export function verifySignature(
  timestamp: string,
  nonce: string,
  signature: string,
  encryptKey: string,
  body: string
): boolean {
  const expectedSignature = calculateSignature(timestamp, nonce, encryptKey, body);
  return expectedSignature === signature;
}
