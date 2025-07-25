import { Context, Schema } from "koishi";
import { Extension, Tool } from "koishi-plugin-yesimbot/services";

@Extension({
    name: '{{name}}',
    display: '{{friendlyName}}',
    description: '{{description}}',
    version: '0.1.0',
})
export default class {{friendlyName.replace(/\s+/g, '')}}Extension {
    static readonly inject = ["database"];
    
    constructor(public ctx: Context, public config: {{friendlyName.replace(/\s+/g, '')}}Config) {
        // 初始化逻辑
    }
    
    @Tool({
        name: 'custom_tool',
        description: '自定义扩展工具',
        parameters: Schema.object({
            param1: Schema.string().required().description('参数说明')
        })
    })
    async customTool({ param1 }: { param1: string }) {
        // 工具实现
        return { result: `处理 ${param1}` };
    }
}

export interface {{friendlyName.replace(/\s+/g, '')}}Config {
    // 配置项定义
}

export const {{friendlyName.replace(/\s+/g, '')}}Config = Schema.object({
    // 配置项 Schema
});
