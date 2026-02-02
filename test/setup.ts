/**
 * Vitest 测试 setup 文件
 */

import { vi } from "vitest";

// 设置测试超时
vi.setConfig({ testTimeout: 30_000 });

// 全局 mock console.error 以减少测试噪音（可选）
// vi.spyOn(console, "error").mockImplementation(() => {});
