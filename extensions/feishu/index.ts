import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { feishuPlugin } from "../../src/feishu/plugin.js";

const plugin = {
  id: "feishu",
  name: "飞书",
  description: "飞书 (Feishu/Lark) 渠道插件",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: feishuPlugin });
  },
};

export default plugin;
