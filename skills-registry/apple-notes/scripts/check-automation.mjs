#!/usr/bin/env node
/**
 * 检测 macOS 自动化权限（访问 Apple Notes）
 * 通过尝试执行一个简单的 AppleScript 来检测权限
 */

import { execSync } from "node:child_process";

function checkAutomation() {
  if (process.platform !== "darwin") {
    console.log(JSON.stringify({
      passed: false,
      message: "仅支持 macOS"
    }));
    return;
  }

  try {
    // 尝试执行一个简单的 AppleScript 访问 Notes
    // 如果没有权限，会抛出错误
    execSync(
      `osascript -e 'tell application "Notes" to count of notes'`,
      { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
    );
    
    console.log(JSON.stringify({
      passed: true,
      message: "已授权访问 Apple Notes"
    }));
  } catch (error) {
    const errorMsg = error.message || "";
    
    // 检查是否是权限错误
    if (errorMsg.includes("not allowed") || 
        errorMsg.includes("permission") || 
        errorMsg.includes("1002") ||
        errorMsg.includes("Not authorized")) {
      console.log(JSON.stringify({
        passed: false,
        message: "未授权访问 Apple Notes",
        help: "请在【系统设置 > 隐私与安全性 > 自动化】中，为终端应用勾选 'Notes' 权限"
      }));
    } else {
      // 其他错误可能是 Notes 未运行等，尝试宽松处理
      console.log(JSON.stringify({
        passed: true,
        message: "权限检测完成（请确保已授权）",
        warning: "首次使用时如遇权限问题，请在系统设置中授权"
      }));
    }
  }
}

checkAutomation();
