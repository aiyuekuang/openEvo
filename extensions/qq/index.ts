import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { qqPlugin } from "../../src/qq/plugin.js";

const plugin = {
  id: "qq",
  name: "QQ",
  description: "QQ 机器人 (OneBot 协议) 渠道插件",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: qqPlugin });
  },
};

export default plugin;
