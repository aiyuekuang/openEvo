import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { wechatPlugin } from "../../src/wechat/plugin.js";

const plugin = {
  id: "wechat",
  name: "微信",
  description: "个人微信 (Wechaty) 渠道插件",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: wechatPlugin });
  },
};

export default plugin;
