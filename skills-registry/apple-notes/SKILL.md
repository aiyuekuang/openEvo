---
name: apple-notes
description: Manage Apple Notes via the `memo` CLI on macOS (create, view, edit, delete, search, move, and export notes). Use when a user asks OpenClaw to add a note, list notes, search notes, or manage note folders.
homepage: https://github.com/antoniorodr/memo
metadata:
---

# Apple Notes CLI

Use `memo notes` to manage Apple Notes directly from the terminal. Create, view, edit, delete, search, move notes between folders, and export to HTML/Markdown.

## ⚠️ 首次使用前必须配置权限

此技能使用 AppleScript 操作 Apple Notes，需要授权自动化权限：

1. 首次运行 `memo` 命令时，macOS 会弹出权限请求对话框，点击「好」
2. 如果错过了弹窗，手动授权：**系统设置 > 隐私与安全性 > 自动化** > 为你的终端应用勾选「Notes」

## 安装
- Homebrew: `brew tap antoniorodr/memo && brew install antoniorodr/memo/memo`
- pip: `pip install .` (克隆仓库后)

View Notes
- List all notes: `memo notes`
- Filter by folder: `memo notes -f "Folder Name"`
- Search notes (fuzzy): `memo notes -s "query"`

Create Notes
- Add a new note: `memo notes -a`
  - Opens an interactive editor to compose the note.
- Quick add with title: `memo notes -a "Note Title"`

Edit Notes
- Edit existing note: `memo notes -e`
  - Interactive selection of note to edit.

Delete Notes
- Delete a note: `memo notes -d`
  - Interactive selection of note to delete.

Move Notes
- Move note to folder: `memo notes -m`
  - Interactive selection of note and destination folder.

Export Notes
- Export to HTML/Markdown: `memo notes -ex`
  - Exports selected note; uses Mistune for markdown processing.

Limitations
- Cannot edit notes containing images or attachments.
- Interactive prompts may require terminal access.

Notes
- macOS-only.
- Requires Apple Notes.app to be accessible.
- For automation, grant permissions in System Settings > Privacy & Security > Automation.
