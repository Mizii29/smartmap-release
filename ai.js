// ai.js
import 'dotenv/config';

const AI_CONFIG = {
    provider: 'qwen',
    apiKey: process.env.QWEN_API_KEY,
    baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.QWEN_MODEL || 'qwen-turbo', // 支持环境变量覆盖
    defaultTemperature: 0.8,
    defaultMaxTokens: 1500,
    timeout: 30000 // 30秒超时
};

/**
 * 统一 AI 调用函数
 * @param {string} prompt - 提示词
 * @param {object} options - 可选配置 { systemPrompt, model, temperature, maxTokens }
 * @returns {Promise<string>} AI 生成的文本
 */
export async function callAI(prompt, options = {}) {
    // 参数校验
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('请提供有效的提示词');
    }
    if (!AI_CONFIG.apiKey) {
        throw new Error('未配置 QWEN_API_KEY，请检查 .env 文件');
    }

    const {
        systemPrompt = `你是一个专业的旅行日记助手，擅长用优美生动的语言记录旅途见闻。
                        【写作要求】
                        1. 字数严格控制在300-400字之间
                        2. 必须包含：日期天气、具体景点细节描写、个人感受三个部分
                        3. 语言要有画面感，多用感官描写（视觉、听觉、嗅觉）
                        4. 用连贯的段落，不要使用列表
                        5. 开头要有场景感，结尾要有感悟或回味`,
        model = AI_CONFIG.model,
        temperature = AI_CONFIG.defaultTemperature,
        maxTokens = AI_CONFIG.defaultMaxTokens
    } = options;

    const promptPreview = prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt;
    console.log(`[AI调用] 模型: ${model}, 温度: ${temperature}, Prompt: ${promptPreview}`);

    if (AI_CONFIG.provider === 'qwen') {
        return callQwen(prompt, { systemPrompt, model, temperature, maxTokens });
    } else {
        throw new Error(`Unsupported AI provider: ${AI_CONFIG.provider}`);
    }
}

async function callQwen(prompt, { systemPrompt, model, temperature, maxTokens }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);

    try {
        const response = await fetch(`${AI_CONFIG.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    { role: 'user', content: prompt }
                ],
                temperature,
                max_tokens: maxTokens,
                top_p: 0.9
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMsg = `请求失败 (状态码: ${response.status})`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorData.error?.message || errorMsg;
            } catch (e) {
                errorMsg = await response.text() || errorMsg;
            }

            // 详细的错误分类处理
            if (response.status === 400) {
                throw new Error('请求参数错误，请检查 model 名称、请求格式是否正确');
            } else if (response.status === 401) {
                throw new Error('API Key 无效或已过期，请检查 .env 文件中的 QWEN_API_KEY');
            } else if (response.status === 403) {
                throw new Error('权限不足：请确认已开通通义千问服务、账号无欠费、API Key 有对应模型权限。可登录阿里云百炼平台检查。');
            } else if (response.status === 404) {
                throw new Error('请求地址不存在，请检查 baseURL 和接口路径是否正确');
            } else if (response.status === 429) {
                throw new Error('API调用频率超限或免费额度已用完，请稍后再试或升级套餐');
            } else if (response.status >= 500) {
                throw new Error('通义千问服务器内部错误，请稍后重试');
            } else {
                throw new Error(`通义千问 API 错误: ${errorMsg}`);
            }
        }

        const data = await response.json();
        const result = data.choices[0].message.content.trim();
        console.log(`[AI调用成功] 生成字数: ${result.length}`);
        return result;

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('AI请求超时，请检查网络连接后重试');
        }
        throw error;
    }
}

// 可扩展文心一言等其他 API...