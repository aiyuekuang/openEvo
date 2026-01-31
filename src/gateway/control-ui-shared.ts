/**
 * 简化版 control-ui-shared.ts
 * 只保留被其他模块使用的辅助函数
 */

export const CONTROL_UI_AVATAR_PREFIX = "/__avatar";

/**
 * Normalize a base path for consistency (e.g., ensure it starts with "/" and has no trailing slash).
 */
export function normalizeControlUiBasePath(raw?: string | null): string {
  if (!raw) return "";
  let normalized = raw.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  while (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized === "/" ? "" : normalized;
}

/**
 * Build a URL for the avatar endpoint.
 */
export function buildControlUiAvatarUrl(basePath: string | null | undefined, agentId: string): string {
  const normalizedBase = normalizeControlUiBasePath(basePath);
  return `${normalizedBase}${CONTROL_UI_AVATAR_PREFIX}/${encodeURIComponent(agentId)}`;
}

/**
 * Resolve an avatar value to a URL if it's a local avatar reference.
 * Returns the avatar URL or null if not applicable.
 */
export function resolveAssistantAvatarUrl(params: {
  avatar?: string | null;
  agentId?: string;
  basePath?: string | null;
}): string | null {
  const { avatar, agentId, basePath } = params;
  if (!avatar) return null;
  
  // If it's already a URL or data URI, return as-is
  if (avatar.startsWith("http://") || avatar.startsWith("https://") || avatar.startsWith("data:")) {
    return avatar;
  }
  
  // If it's a local file reference and we have an agentId, build the avatar URL
  if (agentId && (avatar.startsWith("/") || avatar.startsWith("~") || avatar.includes("/"))) {
    return buildControlUiAvatarUrl(basePath, agentId);
  }
  
  return null;
}
