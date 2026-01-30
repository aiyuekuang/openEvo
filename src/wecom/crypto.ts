/**
 * 企业微信消息加解密
 * WeCom Message Encryption/Decryption
 * 
 * 实现企业微信回调消息的加解密和签名验证
 * https://developer.work.weixin.qq.com/document/path/90968
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * 计算签名
 */
export function computeSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
): string {
  const arr = [token, timestamp, nonce, encrypt].sort();
  const str = arr.join("");
  return createHash("sha1").update(str).digest("hex");
}

/**
 * 验证签名
 */
export function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  signature: string,
): boolean {
  const computed = computeSignature(token, timestamp, nonce, encrypt);
  return computed === signature;
}

/**
 * 生成 AES Key (从 EncodingAESKey 解码)
 */
function getAESKey(encodingAESKey: string): Buffer {
  return Buffer.from(encodingAESKey + "=", "base64");
}

/**
 * PKCS7 填充
 */
function pkcs7Pad(data: Buffer, blockSize: number): Buffer {
  const padLen = blockSize - (data.length % blockSize);
  const padding = Buffer.alloc(padLen, padLen);
  return Buffer.concat([data, padding]);
}

/**
 * PKCS7 去填充
 */
function pkcs7Unpad(data: Buffer): Buffer {
  const padLen = data[data.length - 1];
  if (padLen < 1 || padLen > 32) {
    return data;
  }
  return data.subarray(0, data.length - padLen);
}

/**
 * 解密消息
 */
export function decryptMessage(
  encodingAESKey: string,
  encrypt: string,
  corpId: string,
): string {
  const key = getAESKey(encodingAESKey);
  const iv = key.subarray(0, 16);
  
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  
  const encrypted = Buffer.from(encrypt, "base64");
  const decryptedRaw = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const decrypted = pkcs7Unpad(decryptedRaw);
  
  // 解析消息格式: random(16B) + msgLen(4B) + msg + receiveid
  // const random = decrypted.subarray(0, 16);
  const msgLen = decrypted.readUInt32BE(16);
  const msg = decrypted.subarray(20, 20 + msgLen).toString("utf-8");
  const receiveid = decrypted.subarray(20 + msgLen).toString("utf-8");
  
  // 验证 receiveid (应该等于 corpId)
  if (receiveid !== corpId) {
    throw new Error(`WeCom decrypt: receiveid mismatch (got ${receiveid}, expected ${corpId})`);
  }
  
  return msg;
}

/**
 * 加密消息
 */
export function encryptMessage(
  encodingAESKey: string,
  message: string,
  corpId: string,
): string {
  const key = getAESKey(encodingAESKey);
  const iv = key.subarray(0, 16);
  
  const random = randomBytes(16);
  const msgBuf = Buffer.from(message, "utf-8");
  const msgLen = Buffer.alloc(4);
  msgLen.writeUInt32BE(msgBuf.length, 0);
  const receiveid = Buffer.from(corpId, "utf-8");
  
  const rawData = Buffer.concat([random, msgLen, msgBuf, receiveid]);
  const data = pkcs7Pad(rawData, 32);
  
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return encrypted.toString("base64");
}

/**
 * 生成回复消息的 XML
 */
export function encryptReplyMessage(
  encodingAESKey: string,
  token: string,
  replyMsg: string,
  corpId: string,
  timestamp?: string,
  nonce?: string,
): string {
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
  const nc = nonce ?? randomBytes(8).toString("hex");
  
  const encrypt = encryptMessage(encodingAESKey, replyMsg, corpId);
  const signature = computeSignature(token, ts, nc, encrypt);
  
  return `<xml>
<Encrypt><![CDATA[${encrypt}]]></Encrypt>
<MsgSignature><![CDATA[${signature}]]></MsgSignature>
<TimeStamp>${ts}</TimeStamp>
<Nonce><![CDATA[${nc}]]></Nonce>
</xml>`;
}

/**
 * 解析回调请求的 URL 验证 (echostr)
 */
export function decryptEchoStr(
  encodingAESKey: string,
  echostr: string,
  corpId: string,
): string {
  return decryptMessage(encodingAESKey, echostr, corpId);
}
