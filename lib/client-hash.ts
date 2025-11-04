/**
 * 客户端文件哈希计算工具
 * 使用 Web Crypto API 在浏览器环境中计算文件的 SHA256 哈希值
 */

/**
 * 计算文件的 SHA256 哈希值
 * @param file 要计算哈希的文件
 * @returns 十六进制格式的 SHA256 哈希字符串
 */
export async function calculateFileSHA256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * 从文件名中提取扩展名
 * @param filename 文件名
 * @returns 小写的扩展名（不含点），如果没有扩展名则返回 'bin'
 */
export function extractExtension(filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'bin';
}

/**
 * 生成占位符 URL
 * @param sha256 文件的 SHA256 哈希值
 * @param ext 文件扩展名
 * @returns 占位符字符串，格式为 "pending:sha256.ext"
 */
export function generatePlaceholder(sha256: string, ext: string): string {
  return `pending:${sha256}.${ext}`;
}

/**
 * 从占位符中提取 SHA256 和扩展名
 * @param placeholder 占位符字符串
 * @returns 包含 sha256 和 ext 的对象，如果不是有效占位符则返回 null
 */
export function parsePlaceholder(placeholder: string): { sha256: string; ext: string } | null {
  const match = placeholder.match(/^pending:([a-f0-9]{64})\.([a-z0-9]+)$/);
  if (!match) return null;
  return { sha256: match[1], ext: match[2] };
}

