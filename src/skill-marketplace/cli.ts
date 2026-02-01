/**
 * 技能市场 - CLI 命令
 *
 * @module skill-marketplace/cli
 */

import { Command } from "commander";
import chalk from "chalk";

import { getBuiltinSkills } from "./builtin-catalog.js";
import {
  checkUpdates,
  disableSkill,
  enableSkill,
  installSkill,
  uninstallSkill,
  updateSkill,
} from "./install.js";
import { getInstalledSkill, getInstalledSkills } from "./registry.js";
import { browseByCategory, getSkillById, searchSkills } from "./search.js";
import { SKILL_CATEGORIES, type SkillCategory, type SkillPackage } from "./types.js";

/**
 * CLI 日志器
 */
const cliLogger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.log(chalk.yellow(msg)),
  error: (msg: string) => console.log(chalk.red(msg)),
};

/**
 * 格式化技能列表项
 */
function formatSkillListItem(skill: SkillPackage, installed: boolean): string {
  const icon = skill.icon ?? "📦";
  const badge = skill.verified ? chalk.blue(" ✓") : "";
  const featuredBadge = skill.featured ? chalk.yellow(" ⭐") : "";
  const installedBadge = installed ? chalk.green(" [已安装]") : "";

  return `${icon} ${chalk.bold(skill.name)}${badge}${featuredBadge}${installedBadge}
   ${chalk.gray(skill.id)} v${skill.version}
   ${skill.description}`;
}

/**
 * 格式化技能详情
 */
function formatSkillDetail(skill: SkillPackage, installed: boolean): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`${skill.icon ?? "📦"} ${chalk.bold.cyan(skill.name)} v${skill.version}`);
  lines.push(chalk.gray(`   ${skill.id}`));
  lines.push("");

  if (skill.verified) {
    lines.push(chalk.blue("   ✓ 官方认证"));
  }
  if (skill.featured) {
    lines.push(chalk.yellow("   ⭐ 推荐技能"));
  }
  if (installed) {
    lines.push(chalk.green("   ✓ 已安装"));
  }

  lines.push("");
  lines.push(chalk.bold("描述"));
  lines.push(`   ${skill.description}`);

  if (skill.longDescription) {
    lines.push("");
    lines.push(chalk.bold("详细说明"));
    lines.push(
      skill.longDescription
        .split("\n")
        .map((l) => `   ${l}`)
        .join("\n"),
    );
  }

  lines.push("");
  lines.push(chalk.bold("信息"));
  lines.push(`   分类: ${getCategoryLabel(skill.category)}`);
  lines.push(`   作者: ${skill.author.name}`);
  lines.push(`   许可: ${skill.license}`);
  if (skill.homepage) {
    lines.push(`   主页: ${skill.homepage}`);
  }
  if (skill.tags.length > 0) {
    lines.push(`   标签: ${skill.tags.join(", ")}`);
  }

  lines.push("");
  lines.push(chalk.bold("能力"));
  for (const cap of skill.capabilities) {
    switch (cap.type) {
      case "channel":
        lines.push(`   📬 渠道: ${cap.id}`);
        break;
      case "provider":
        lines.push(`   🤖 模型: ${cap.id}`);
        break;
      case "tool":
        lines.push(`   🔧 工具: ${cap.names.join(", ")}`);
        break;
      case "hook":
        lines.push(`   🪝 钩子: ${cap.events.join(", ")}`);
        break;
      case "command":
        lines.push(`   ⌨️ 命令: ${cap.names.join(", ")}`);
        break;
      case "service":
        lines.push(`   ⚙️ 服务: ${cap.id}`);
        break;
    }
  }

  return lines.join("\n");
}

/**
 * 获取分类标签
 */
function getCategoryLabel(category: SkillCategory): string {
  const meta = SKILL_CATEGORIES.find((c) => c.id === category);
  return meta ? `${meta.icon} ${meta.label}` : category;
}

/**
 * 创建 skill 命令组
 */
export function createSkillCommand(): Command {
  const skill = new Command("skill").description("技能市场 - 发现、安装、管理 AI 技能");

  // openclaw skill search <query>
  skill
    .command("search [query]")
    .description("搜索技能")
    .option("-c, --category <category>", "按分类过滤")
    .option("-t, --tag <tag>", "按标签过滤")
    .option("--verified", "只显示官方认证")
    .option("--featured", "只显示推荐")
    .option("-l, --limit <number>", "结果数量", "20")
    .action(async (query: string | undefined, opts) => {
      const result = await searchSkills({
        query,
        category: opts.category as SkillCategory | undefined,
        tags: opts.tag ? [opts.tag] : undefined,
        verifiedOnly: opts.verified,
        featuredOnly: opts.featured,
        limit: parseInt(opts.limit, 10),
      });

      const installedSkills = await getInstalledSkills();
      const installedIds = new Set(installedSkills.map((s) => s.id));

      if (result.skills.length === 0) {
        console.log(chalk.yellow("没有找到匹配的技能"));
        return;
      }

      console.log(chalk.bold(`\n找到 ${result.total} 个技能:\n`));

      for (const skill of result.skills) {
        console.log(formatSkillListItem(skill, installedIds.has(skill.id)));
        console.log("");
      }

      if (result.hasMore) {
        console.log(chalk.gray(`还有 ${result.total - result.skills.length} 个结果...`));
      }
    });

  // openclaw skill browse [category]
  skill
    .command("browse [category]")
    .description("浏览技能分类")
    .action(async (category: string | undefined) => {
      if (!category) {
        // 列出所有分类
        console.log(chalk.bold("\n技能分类:\n"));
        for (const cat of SKILL_CATEGORIES) {
          const count = getBuiltinSkills().filter((s) => s.category === cat.id).length;
          console.log(`${cat.icon} ${chalk.bold(cat.label)} (${count})`);
          console.log(chalk.gray(`   ${cat.description}`));
          console.log(chalk.gray(`   openclaw skill browse ${cat.id}\n`));
        }
        return;
      }

      const result = await browseByCategory(category as SkillCategory);
      const installedSkills = await getInstalledSkills();
      const installedIds = new Set(installedSkills.map((s) => s.id));

      const catMeta = SKILL_CATEGORIES.find((c) => c.id === category);
      console.log(chalk.bold(`\n${catMeta?.icon ?? "📁"} ${catMeta?.label ?? category}:\n`));

      if (result.skills.length === 0) {
        console.log(chalk.yellow("该分类下没有技能"));
        return;
      }

      for (const skill of result.skills) {
        console.log(formatSkillListItem(skill, installedIds.has(skill.id)));
        console.log("");
      }
    });

  // openclaw skill info <skill-id>
  skill
    .command("info <skill-id>")
    .description("查看技能详情")
    .action(async (skillId: string) => {
      const skill = getSkillById(skillId);
      if (!skill) {
        console.log(chalk.red(`找不到技能: ${skillId}`));
        return;
      }

      const installed = await getInstalledSkill(skillId);
      console.log(formatSkillDetail(skill, installed !== null));
    });

  // openclaw skill install <skill-id>
  skill
    .command("install <skill-id>")
    .description("安装技能")
    .option("-f, --force", "强制重新安装")
    .action(async (skillId: string, opts) => {
      const result = await installSkill(skillId, {
        logger: cliLogger,
        force: opts.force,
      });

      if (!result.ok) {
        console.log(chalk.red(`\n安装失败: ${result.error}`));
        process.exitCode = 1;
      }
    });

  // openclaw skill uninstall <skill-id>
  skill
    .command("uninstall <skill-id>")
    .description("卸载技能")
    .action(async (skillId: string) => {
      const result = await uninstallSkill(skillId, { logger: cliLogger });

      if (!result.ok) {
        console.log(chalk.red(`\n卸载失败: ${result.error}`));
        process.exitCode = 1;
      }
    });

  // openclaw skill list
  skill
    .command("list")
    .description("列出已安装的技能")
    .option("-a, --all", "显示所有技能 (包括禁用)")
    .action(async (opts) => {
      const installedSkills = await getInstalledSkills();

      if (installedSkills.length === 0) {
        console.log(chalk.yellow("\n尚未安装任何技能"));
        console.log(chalk.gray("使用 `openclaw skill search` 发现技能"));
        return;
      }

      console.log(chalk.bold(`\n已安装 ${installedSkills.length} 个技能:\n`));

      for (const installed of installedSkills) {
        if (!opts.all && installed.status === "disabled") continue;

        const skill = getSkillById(installed.id);
        const name = skill?.name ?? installed.id;
        const icon = skill?.icon ?? "📦";

        let statusBadge = "";
        switch (installed.status) {
          case "active":
            statusBadge = chalk.green("● 活跃");
            break;
          case "disabled":
            statusBadge = chalk.gray("○ 禁用");
            break;
          case "error":
            statusBadge = chalk.red("✗ 错误");
            break;
        }

        console.log(`${icon} ${chalk.bold(name)} v${installed.version}  ${statusBadge}`);
        console.log(chalk.gray(`   ${installed.id}`));
        if (installed.status === "error" && installed.error) {
          console.log(chalk.red(`   ${installed.error}`));
        }
        console.log("");
      }
    });

  // openclaw skill enable <skill-id>
  skill
    .command("enable <skill-id>")
    .description("启用技能")
    .action(async (skillId: string) => {
      const result = await enableSkill(skillId, { logger: cliLogger });
      if (!result.ok) {
        console.log(chalk.red(result.error));
        process.exitCode = 1;
      }
    });

  // openclaw skill disable <skill-id>
  skill
    .command("disable <skill-id>")
    .description("禁用技能")
    .action(async (skillId: string) => {
      const result = await disableSkill(skillId, { logger: cliLogger });
      if (!result.ok) {
        console.log(chalk.red(result.error));
        process.exitCode = 1;
      }
    });

  // openclaw skill outdated
  skill
    .command("outdated")
    .description("检查可更新的技能")
    .action(async () => {
      const updates = await checkUpdates();

      if (updates.length === 0) {
        console.log(chalk.green("\n所有技能已是最新版本 ✓"));
        return;
      }

      console.log(chalk.bold(`\n${updates.length} 个技能可更新:\n`));

      for (const update of updates) {
        const skill = getSkillById(update.id);
        const name = skill?.name ?? update.id;
        console.log(
          `${skill?.icon ?? "📦"} ${chalk.bold(name)}: ${chalk.red(update.currentVersion)} → ${chalk.green(update.latestVersion)}`,
        );
      }

      console.log(chalk.gray("\n使用 `openclaw skill update <skill-id>` 更新单个技能"));
      console.log(chalk.gray("使用 `openclaw skill update --all` 更新所有技能"));
    });

  // openclaw skill update [skill-id]
  skill
    .command("update [skill-id]")
    .description("更新技能")
    .option("-a, --all", "更新所有技能")
    .action(async (skillId: string | undefined, opts) => {
      if (opts.all) {
        const updates = await checkUpdates();
        if (updates.length === 0) {
          console.log(chalk.green("\n所有技能已是最新版本 ✓"));
          return;
        }

        console.log(chalk.bold(`\n更新 ${updates.length} 个技能...\n`));

        for (const update of updates) {
          await updateSkill(update.id, { logger: cliLogger });
        }
        return;
      }

      if (!skillId) {
        console.log(chalk.red("请指定技能 ID 或使用 --all 更新所有"));
        process.exitCode = 1;
        return;
      }

      const result = await updateSkill(skillId, { logger: cliLogger });
      if (!result.ok) {
        console.log(chalk.red(`\n更新失败: ${result.error}`));
        process.exitCode = 1;
      }
    });

  return skill;
}

/**
 * 注册 skill 命令到主程序
 */
export function registerSkillCommand(program: Command): void {
  program.addCommand(createSkillCommand());
}
