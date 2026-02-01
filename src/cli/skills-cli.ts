import type { Command } from "commander";
import chalk from "chalk";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import {
  buildWorkspaceSkillStatus,
  type SkillStatusEntry,
  type SkillStatusReport,
} from "../agents/skills-status.js";
import { loadConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import {
  browseByCategory,
  checkUpdates,
  disableSkill,
  enableSkill,
  getBuiltinSkills,
  getInstalledSkill,
  getInstalledSkills,
  getSkillById,
  installSkill,
  searchSkills,
  SKILL_CATEGORIES,
  uninstallSkill,
  updateSkill,
  type SkillCategory,
  type SkillPackage,
} from "../skill-marketplace/index.js";
import { formatDocsLink } from "../terminal/links.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";
import { formatCliCommand } from "./command-format.js";

export type SkillsListOptions = {
  json?: boolean;
  eligible?: boolean;
  verbose?: boolean;
};

export type SkillInfoOptions = {
  json?: boolean;
};

export type SkillsCheckOptions = {
  json?: boolean;
};

function appendClawdHubHint(output: string, json?: boolean): string {
  if (json) return output;
  return `${output}\n\nTip: use \`npx clawdhub\` to search, install, and sync skills.`;
}

function formatSkillStatus(skill: SkillStatusEntry): string {
  if (skill.eligible) return theme.success("✓ ready");
  if (skill.disabled) return theme.warn("⏸ disabled");
  if (skill.blockedByAllowlist) return theme.warn("🚫 blocked");
  return theme.error("✗ missing");
}

function formatSkillName(skill: SkillStatusEntry): string {
  const emoji = skill.emoji ?? "📦";
  return `${emoji} ${theme.command(skill.name)}`;
}

function formatSkillMissingSummary(skill: SkillStatusEntry): string {
  const missing: string[] = [];
  if (skill.missing.bins.length > 0) {
    missing.push(`bins: ${skill.missing.bins.join(", ")}`);
  }
  if (skill.missing.anyBins.length > 0) {
    missing.push(`anyBins: ${skill.missing.anyBins.join(", ")}`);
  }
  if (skill.missing.env.length > 0) {
    missing.push(`env: ${skill.missing.env.join(", ")}`);
  }
  if (skill.missing.config.length > 0) {
    missing.push(`config: ${skill.missing.config.join(", ")}`);
  }
  if (skill.missing.os.length > 0) {
    missing.push(`os: ${skill.missing.os.join(", ")}`);
  }
  return missing.join("; ");
}

/**
 * Format the skills list output
 */
export function formatSkillsList(report: SkillStatusReport, opts: SkillsListOptions): string {
  const skills = opts.eligible ? report.skills.filter((s) => s.eligible) : report.skills;

  if (opts.json) {
    const jsonReport = {
      workspaceDir: report.workspaceDir,
      managedSkillsDir: report.managedSkillsDir,
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        emoji: s.emoji,
        eligible: s.eligible,
        disabled: s.disabled,
        blockedByAllowlist: s.blockedByAllowlist,
        source: s.source,
        primaryEnv: s.primaryEnv,
        homepage: s.homepage,
        missing: s.missing,
      })),
    };
    return JSON.stringify(jsonReport, null, 2);
  }

  if (skills.length === 0) {
    const message = opts.eligible
      ? `No eligible skills found. Run \`${formatCliCommand("openclaw skills list")}\` to see all skills.`
      : "No skills found.";
    return appendClawdHubHint(message, opts.json);
  }

  const eligible = skills.filter((s) => s.eligible);
  const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
  const rows = skills.map((skill) => {
    const missing = formatSkillMissingSummary(skill);
    return {
      Status: formatSkillStatus(skill),
      Skill: formatSkillName(skill),
      Description: theme.muted(skill.description),
      Source: skill.source ?? "",
      Missing: missing ? theme.warn(missing) : "",
    };
  });

  const columns = [
    { key: "Status", header: "Status", minWidth: 10 },
    { key: "Skill", header: "Skill", minWidth: 18, flex: true },
    { key: "Description", header: "Description", minWidth: 24, flex: true },
    { key: "Source", header: "Source", minWidth: 10 },
  ];
  if (opts.verbose) {
    columns.push({ key: "Missing", header: "Missing", minWidth: 18, flex: true });
  }

  const lines: string[] = [];
  lines.push(
    `${theme.heading("Skills")} ${theme.muted(`(${eligible.length}/${skills.length} ready)`)}`,
  );
  lines.push(
    renderTable({
      width: tableWidth,
      columns,
      rows,
    }).trimEnd(),
  );

  return appendClawdHubHint(lines.join("\n"), opts.json);
}

/**
 * Format detailed info for a single skill
 */
export function formatSkillInfo(
  report: SkillStatusReport,
  skillName: string,
  opts: SkillInfoOptions,
): string {
  const skill = report.skills.find((s) => s.name === skillName || s.skillKey === skillName);

  if (!skill) {
    if (opts.json) {
      return JSON.stringify({ error: "not found", skill: skillName }, null, 2);
    }
    return appendClawdHubHint(
      `Skill "${skillName}" not found. Run \`${formatCliCommand("openclaw skills list")}\` to see available skills.`,
      opts.json,
    );
  }

  if (opts.json) {
    return JSON.stringify(skill, null, 2);
  }

  const lines: string[] = [];
  const emoji = skill.emoji ?? "📦";
  const status = skill.eligible
    ? theme.success("✓ Ready")
    : skill.disabled
      ? theme.warn("⏸ Disabled")
      : skill.blockedByAllowlist
        ? theme.warn("🚫 Blocked by allowlist")
        : theme.error("✗ Missing requirements");

  lines.push(`${emoji} ${theme.heading(skill.name)} ${status}`);
  lines.push("");
  lines.push(skill.description);
  lines.push("");

  // Details
  lines.push(theme.heading("Details:"));
  lines.push(`${theme.muted("  Source:")} ${skill.source}`);
  lines.push(`${theme.muted("  Path:")} ${shortenHomePath(skill.filePath)}`);
  if (skill.homepage) {
    lines.push(`${theme.muted("  Homepage:")} ${skill.homepage}`);
  }
  if (skill.primaryEnv) {
    lines.push(`${theme.muted("  Primary env:")} ${skill.primaryEnv}`);
  }

  // Requirements
  const hasRequirements =
    skill.requirements.bins.length > 0 ||
    skill.requirements.anyBins.length > 0 ||
    skill.requirements.env.length > 0 ||
    skill.requirements.config.length > 0 ||
    skill.requirements.os.length > 0;

  if (hasRequirements) {
    lines.push("");
    lines.push(theme.heading("Requirements:"));
    if (skill.requirements.bins.length > 0) {
      const binsStatus = skill.requirements.bins.map((bin) => {
        const missing = skill.missing.bins.includes(bin);
        return missing ? theme.error(`✗ ${bin}`) : theme.success(`✓ ${bin}`);
      });
      lines.push(`${theme.muted("  Binaries:")} ${binsStatus.join(", ")}`);
    }
    if (skill.requirements.anyBins.length > 0) {
      const anyBinsMissing = skill.missing.anyBins.length > 0;
      const anyBinsStatus = skill.requirements.anyBins.map((bin) => {
        const missing = anyBinsMissing;
        return missing ? theme.error(`✗ ${bin}`) : theme.success(`✓ ${bin}`);
      });
      lines.push(`${theme.muted("  Any binaries:")} ${anyBinsStatus.join(", ")}`);
    }
    if (skill.requirements.env.length > 0) {
      const envStatus = skill.requirements.env.map((env) => {
        const missing = skill.missing.env.includes(env);
        return missing ? theme.error(`✗ ${env}`) : theme.success(`✓ ${env}`);
      });
      lines.push(`${theme.muted("  Environment:")} ${envStatus.join(", ")}`);
    }
    if (skill.requirements.config.length > 0) {
      const configStatus = skill.requirements.config.map((cfg) => {
        const missing = skill.missing.config.includes(cfg);
        return missing ? theme.error(`✗ ${cfg}`) : theme.success(`✓ ${cfg}`);
      });
      lines.push(`${theme.muted("  Config:")} ${configStatus.join(", ")}`);
    }
    if (skill.requirements.os.length > 0) {
      const osStatus = skill.requirements.os.map((osName) => {
        const missing = skill.missing.os.includes(osName);
        return missing ? theme.error(`✗ ${osName}`) : theme.success(`✓ ${osName}`);
      });
      lines.push(`${theme.muted("  OS:")} ${osStatus.join(", ")}`);
    }
  }

  // Install options
  if (skill.install.length > 0 && !skill.eligible) {
    lines.push("");
    lines.push(theme.heading("Install options:"));
    for (const inst of skill.install) {
      lines.push(`  ${theme.warn("→")} ${inst.label}`);
    }
  }

  return appendClawdHubHint(lines.join("\n"), opts.json);
}

/**
 * Format a check/summary of all skills status
 */
export function formatSkillsCheck(report: SkillStatusReport, opts: SkillsCheckOptions): string {
  const eligible = report.skills.filter((s) => s.eligible);
  const disabled = report.skills.filter((s) => s.disabled);
  const blocked = report.skills.filter((s) => s.blockedByAllowlist && !s.disabled);
  const missingReqs = report.skills.filter(
    (s) => !s.eligible && !s.disabled && !s.blockedByAllowlist,
  );

  if (opts.json) {
    return JSON.stringify(
      {
        summary: {
          total: report.skills.length,
          eligible: eligible.length,
          disabled: disabled.length,
          blocked: blocked.length,
          missingRequirements: missingReqs.length,
        },
        eligible: eligible.map((s) => s.name),
        disabled: disabled.map((s) => s.name),
        blocked: blocked.map((s) => s.name),
        missingRequirements: missingReqs.map((s) => ({
          name: s.name,
          missing: s.missing,
          install: s.install,
        })),
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(theme.heading("Skills Status Check"));
  lines.push("");
  lines.push(`${theme.muted("Total:")} ${report.skills.length}`);
  lines.push(`${theme.success("✓")} ${theme.muted("Eligible:")} ${eligible.length}`);
  lines.push(`${theme.warn("⏸")} ${theme.muted("Disabled:")} ${disabled.length}`);
  lines.push(`${theme.warn("🚫")} ${theme.muted("Blocked by allowlist:")} ${blocked.length}`);
  lines.push(`${theme.error("✗")} ${theme.muted("Missing requirements:")} ${missingReqs.length}`);

  if (eligible.length > 0) {
    lines.push("");
    lines.push(theme.heading("Ready to use:"));
    for (const skill of eligible) {
      const emoji = skill.emoji ?? "📦";
      lines.push(`  ${emoji} ${skill.name}`);
    }
  }

  if (missingReqs.length > 0) {
    lines.push("");
    lines.push(theme.heading("Missing requirements:"));
    for (const skill of missingReqs) {
      const emoji = skill.emoji ?? "📦";
      const missing: string[] = [];
      if (skill.missing.bins.length > 0) {
        missing.push(`bins: ${skill.missing.bins.join(", ")}`);
      }
      if (skill.missing.anyBins.length > 0) {
        missing.push(`anyBins: ${skill.missing.anyBins.join(", ")}`);
      }
      if (skill.missing.env.length > 0) {
        missing.push(`env: ${skill.missing.env.join(", ")}`);
      }
      if (skill.missing.config.length > 0) {
        missing.push(`config: ${skill.missing.config.join(", ")}`);
      }
      if (skill.missing.os.length > 0) {
        missing.push(`os: ${skill.missing.os.join(", ")}`);
      }
      lines.push(`  ${emoji} ${skill.name} ${theme.muted(`(${missing.join("; ")})`)}`);
    }
  }

  return appendClawdHubHint(lines.join("\n"), opts.json);
}

/**
 * Register the skills CLI commands
 */
export function registerSkillsCli(program: Command) {
  const skills = program
    .command("skills")
    .description("List, inspect, and manage skills")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/skills", "docs.openclaw.ai/cli/skills")}\n`,
    );

  // 注册技能市场子命令
  registerSkillMarketplace(skills);

  skills
    .command("list")
    .description("List all available skills")
    .option("--json", "Output as JSON", false)
    .option("--eligible", "Show only eligible (ready to use) skills", false)
    .option("-v, --verbose", "Show more details including missing requirements", false)
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
        const report = buildWorkspaceSkillStatus(workspaceDir, { config });
        defaultRuntime.log(formatSkillsList(report, opts));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("info")
    .description("Show detailed information about a skill")
    .argument("<name>", "Skill name")
    .option("--json", "Output as JSON", false)
    .action(async (name, opts) => {
      try {
        const config = loadConfig();
        const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
        const report = buildWorkspaceSkillStatus(workspaceDir, { config });
        defaultRuntime.log(formatSkillInfo(report, name, opts));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("check")
    .description("Check which skills are ready vs missing requirements")
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
        const report = buildWorkspaceSkillStatus(workspaceDir, { config });
        defaultRuntime.log(formatSkillsCheck(report, opts));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // Default action (no subcommand) - show list
  skills.action(async () => {
    try {
      const config = loadConfig();
      const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
      const report = buildWorkspaceSkillStatus(workspaceDir, { config });
      defaultRuntime.log(formatSkillsList(report, {}));
    } catch (err) {
      defaultRuntime.error(String(err));
      defaultRuntime.exit(1);
    }
  });
}

// =============================================================================
// 技能市场 CLI
// =============================================================================

const marketLogger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.log(chalk.yellow(msg)),
  error: (msg: string) => console.log(chalk.red(msg)),
};

function formatMarketSkillItem(skill: SkillPackage, installed: boolean): string {
  const icon = skill.icon ?? "📦";
  const badge = skill.verified ? chalk.blue(" ✓") : "";
  const featuredBadge = skill.featured ? chalk.yellow(" ⭐") : "";
  const installedBadge = installed ? chalk.green(" [已安装]") : "";

  return `${icon} ${chalk.bold(skill.name)}${badge}${featuredBadge}${installedBadge}
   ${chalk.gray(skill.id)} v${skill.version}
   ${skill.description}`;
}

function getCategoryLabel(category: SkillCategory): string {
  const meta = SKILL_CATEGORIES.find((c) => c.id === category);
  return meta ? `${meta.icon} ${meta.label}` : category;
}

/**
 * 注册技能市场子命令
 */
function registerSkillMarketplace(skills: Command) {
  const market = skills
    .command("market")
    .description("技能市场 - 发现、安装、管理技能包");

  // openclaw skills market search <query>
  market
    .command("search [query]")
    .description("搜索技能")
    .option("-c, --category <category>", "按分类过滤")
    .option("--verified", "只显示官方认证")
    .option("--featured", "只显示推荐")
    .option("-l, --limit <number>", "结果数量", "20")
    .action(async (query: string | undefined, opts) => {
      const result = await searchSkills({
        query,
        category: opts.category as SkillCategory | undefined,
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
        console.log(formatMarketSkillItem(skill, installedIds.has(skill.id)));
        console.log("");
      }

      if (result.hasMore) {
        console.log(chalk.gray(`还有 ${result.total - result.skills.length} 个结果...`));
      }
    });

  // openclaw skills market browse [category]
  market
    .command("browse [category]")
    .description("浏览技能分类")
    .action(async (category: string | undefined) => {
      if (!category) {
        console.log(chalk.bold("\n技能分类:\n"));
        for (const cat of SKILL_CATEGORIES) {
          const count = getBuiltinSkills().filter((s) => s.category === cat.id).length;
          console.log(`${cat.icon} ${chalk.bold(cat.label)} (${count})`);
          console.log(chalk.gray(`   ${cat.description}`));
          console.log(chalk.gray(`   openclaw skills market browse ${cat.id}\n`));
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
        console.log(formatMarketSkillItem(skill, installedIds.has(skill.id)));
        console.log("");
      }
    });

  // openclaw skills market show <skill-id>
  market
    .command("show <skill-id>")
    .description("查看技能详情")
    .action(async (skillId: string) => {
      const skill = getSkillById(skillId);
      if (!skill) {
        console.log(chalk.red(`找不到技能: ${skillId}`));
        return;
      }

      const installed = await getInstalledSkill(skillId);
      const lines: string[] = [];

      lines.push("");
      lines.push(`${skill.icon ?? "📦"} ${chalk.bold.cyan(skill.name)} v${skill.version}`);
      lines.push(chalk.gray(`   ${skill.id}`));
      lines.push("");

      if (skill.verified) lines.push(chalk.blue("   ✓ 官方认证"));
      if (skill.featured) lines.push(chalk.yellow("   ⭐ 推荐技能"));
      if (installed) lines.push(chalk.green("   ✓ 已安装"));

      lines.push("");
      lines.push(chalk.bold("描述"));
      lines.push(`   ${skill.description}`);

      lines.push("");
      lines.push(chalk.bold("信息"));
      lines.push(`   分类: ${getCategoryLabel(skill.category)}`);
      lines.push(`   作者: ${skill.author.name}`);
      lines.push(`   许可: ${skill.license}`);
      if (skill.tags.length > 0) {
        lines.push(`   标签: ${skill.tags.join(", ")}`);
      }

      console.log(lines.join("\n"));
    });

  // openclaw skills market install <skill-id>
  market
    .command("install <skill-id>")
    .description("安装技能")
    .option("-f, --force", "强制重新安装")
    .action(async (skillId: string, opts) => {
      const result = await installSkill(skillId, {
        logger: marketLogger,
        force: opts.force,
      });

      if (!result.ok) {
        console.log(chalk.red(`\n安装失败: ${result.error}`));
        process.exitCode = 1;
      }
    });

  // openclaw skills market uninstall <skill-id>
  market
    .command("uninstall <skill-id>")
    .description("卸载技能")
    .action(async (skillId: string) => {
      const result = await uninstallSkill(skillId, { logger: marketLogger });

      if (!result.ok) {
        console.log(chalk.red(`\n卸载失败: ${result.error}`));
        process.exitCode = 1;
      }
    });

  // openclaw skills market installed
  market
    .command("installed")
    .description("列出已安装的技能")
    .action(async () => {
      const installedSkills = await getInstalledSkills();

      if (installedSkills.length === 0) {
        console.log(chalk.yellow("\n尚未安装任何技能"));
        console.log(chalk.gray("使用 `openclaw skills market search` 发现技能"));
        return;
      }

      console.log(chalk.bold(`\n已安装 ${installedSkills.length} 个技能:\n`));

      for (const installed of installedSkills) {
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
        console.log("");
      }
    });

  // openclaw skills market outdated
  market
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

      console.log(chalk.gray("\n使用 `openclaw skills market update <skill-id>` 更新"));
    });

  // openclaw skills market update [skill-id]
  market
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
          await updateSkill(update.id, { logger: marketLogger });
        }
        return;
      }

      if (!skillId) {
        console.log(chalk.red("请指定技能 ID 或使用 --all 更新所有"));
        process.exitCode = 1;
        return;
      }

      const result = await updateSkill(skillId, { logger: marketLogger });
      if (!result.ok) {
        console.log(chalk.red(`\n更新失败: ${result.error}`));
        process.exitCode = 1;
      }
    });

  // openclaw skills market enable <skill-id>
  market
    .command("enable <skill-id>")
    .description("启用技能")
    .action(async (skillId: string) => {
      const result = await enableSkill(skillId, { logger: marketLogger });
      if (!result.ok) {
        console.log(chalk.red(result.error));
        process.exitCode = 1;
      }
    });

  // openclaw skills market disable <skill-id>
  market
    .command("disable <skill-id>")
    .description("禁用技能")
    .action(async (skillId: string) => {
      const result = await disableSkill(skillId, { logger: marketLogger });
      if (!result.ok) {
        console.log(chalk.red(result.error));
        process.exitCode = 1;
      }
    });

  // Default action - show featured
  market.action(async () => {
    const result = await searchSkills({ featuredOnly: true });
    const installedSkills = await getInstalledSkills();
    const installedIds = new Set(installedSkills.map((s) => s.id));

    console.log(chalk.bold("\n⭐ 推荐技能:\n"));

    for (const skill of result.skills) {
      console.log(formatMarketSkillItem(skill, installedIds.has(skill.id)));
      console.log("");
    }

    console.log(chalk.gray("使用 `openclaw skills market search <query>` 搜索更多技能"));
    console.log(chalk.gray("使用 `openclaw skills market browse` 浏览分类"));
  });
}
