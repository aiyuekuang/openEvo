/**
 * 钉钉消息加密解密
 * DingTalk Message Encryption/Decryption
 *
 * 钉钉使用 AES-CBC 加密，与企业微信类似
 */

import crypto from "crypto";

/**
 * PKCS7 填充
 */
function pkcs7Pad(data: Buffer, blockSize: number): Buffer {
  const padding = blockSize - (data.length % blockSize);
  const padBuffer = Buffer.alloc(padding, padding);
  return Buffer.concat([data, padBuffer]);
}

/**
 * PKCS7 去填充
 */
function pkcs7Unpad(data: Buffer): Buffer {
  const padding = data[data.length - 1];
  if (padding > data.length || padding > 32) {
    throw new Error("Invalid PKCS7 padding");
  }
  return data.subarray(0, data.length - padding);
}

/**
 * 解密消息
 */
export function decryptMessage(
  encryptedMsg: string,
  aesKey: string
): { message: string; suiteKey: string } {
  // Base64 解码 AES Key (钉钉的 AES Key 是 43 字符的 Base64)
  const aesKeyBuffer = Buffer.from(aesKey + "=", "base64");

  // IV 是 AES Key 的前 16 字节
  const iv = aesKeyBuffer.subarray(0, 16);

  // Base64 解码加密消息
  const encryptedBuffer = Buffer.from(encryptedMsg, "base64");

  // AES-256-CBC 解密
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKeyBuffer, iv);
  decipher.setAutoPadding(false);

  const decryptedRaw = Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ]);

  // 去除 PKCS7 填充
  const decrypted = pkcs7Unpad(decryptedRaw);

  // 解析内容: 16字节随机数 + 4字节消息长度 + 消息内容 + suiteKey
  const msgLen = decrypted.readUInt32BE(16);
  const message = decrypted.subarray(20, 20 + msgLen).toString("utf-8");
  const suiteKey = decrypted.subarray(20 + msgLen).toString("utf-8");

  return { message, suiteKey };
}

/**
 * 加密消息
 */
export function encryptMessage(
  message: string,
  suiteKey: string,
  aesKey: string
): string {
  // Base64 解码 AES Key
  const aesKeyBuffer = Buffer.from(aesKey + "=", "base64");

  // IV 是 AES Key 的前 16 字节
  const iv = aesKeyBuffer.subarray(0, 16);

  // 16字节随机数
  const random = crypto.randomBytes(16);

  // 消息内容
  const msgBuffer = Buffer.from(message, "utf-8");

  // 消息长度 (4字节大端)
  const msgLenBuffer = Buffer.alloc(4);
  msgLenBuffer.writeUInt32BE(msgBuffer.length, 0);

  // suiteKey
  const suiteKeyBuffer = Buffer.from(suiteKey, "utf-8");

  // 拼接: 随机数 + 长度 + 消息 + suiteKey
  const plaintext = Buffer.concat([
    random,
    msgLenBuffer,
    msgBuffer,
    suiteKeyBuffer,
  ]);

  // PKCS7 填充
  const padded = pkcs7Pad(plaintext, 32);

  // AES-256-CBC 加密
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKeyBuffer, iv);
  cipher.setAutoPadding(false);

  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

  return encrypted.toString("base64");
}

/**
 * 生成签名
 */
export function generateSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string
): string {
  const arr = [token, timestamp, nonce, encrypt].sort();
  const str = arr.join("");
  return crypto.createHash("sha1").update(str).digest("hex");
}

/**
 * 验证签名
 */
export function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  signature: string
): boolean {
  const expectedSignature = generateSignature(token, timestamp, nonce, encrypt);
  return expectedSignature === signature;
}

/**
 * 验证机器人回调签名 (使用 HMAC-SHA256)
 */
export function verifyRobotSignature(
  timestamp: string,
  sign: string,
  appSecret: string
): boolean {
  const stringToSign = `${timestamp}\n${appSecret}`;
  const hmac = crypto.createHmac("sha256", appSecret);
  const expectedSign = hmac.update(stringToSign).digest("base64");

  return sign === expectedSign;
}
