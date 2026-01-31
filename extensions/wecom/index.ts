import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { wecomPlugin } from "../../src/wecom/plugin.js";

const plugin = {
  id: "wecom",
  name: "企业微信",
  description: "企业微信 (WeCom) 渠道插件",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: wecomPlugin });
  },
};

export default plugin;
