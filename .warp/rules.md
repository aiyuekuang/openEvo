# Warp Rules for OpenClaw CN

## Skills 强制匹配规则

**⚠️ 核心原则**: 所有对话都必须匹配到至少一个 Skill，并严格按照该 Skill 的指导执行。

### 规则说明

1. **必须匹配**: 每次对话开始时，先判断应该使用哪个 Skill
2. **严格执行**: 匹配后必须严格按照该 Skill 的流程和要求执行
3. **无匹配反馈**: 如果实在没有合适的 Skill，主动向用户反馈并确认如何处理

### 可用 Skills

| Skill | 路径 | 触发场景 |
|-------|------|----------|
| Config-Driven Dev | `.claude/skills/config-driven-dev/` | 新增功能、配置修改、开关设置 |
| UI/UX Design | `.claude/skills/ui-ux-design.md` | 界面设计、CLI 输出、用户体验 |
| Product Manager | `.claude/skills/product-manager-prompts/` | 产品需求、PRD、用户故事 |
| Code Review | `.claude/skills/code-review/` | 代码审查、安全检查、PR 前检查 |
| Systematic Debugging | `.claude/skills/systematic-debugging/` | Bug 修复、问题排查、调试 |

## 通用规则

- 使用中文回复（除非用户用英文提问）
- 代码注释使用英文
- 遵循项目现有的代码风格
- 修改代码前先理解上下文
