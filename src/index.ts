import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

// Initialize Hugging Face Inference Client
const hfClient = new InferenceClient(process.env.HF_TOKEN)

// Create server instance
const server = new McpServer({
    name: 'YOUR_SERVER_NAME',
    version: '1.0.0',
    capabilities: {
        tools: {},
        resources: {},
        prompts: {}
    }
})

// Greeting tool - returns a greeting message in the specified language
server.tool(
    'greeting',
    'Returns a greeting message in the specified language',
    {
        name: z.string().describe('The name of the person to greet'),
        language: z.enum(['korean', 'english', 'japanese', 'chinese', 'spanish', 'french'])
            .describe('The language to use for the greeting')
    },
    async ({ name, language }) => {
        const greetings: Record<string, string> = {
            korean: `안녕하세요, ${name}님! 반갑습니다!`,
            english: `Hello, ${name}! Nice to meet you!`,
            japanese: `こんにちは、${name}さん！はじめまして！`,
            chinese: `你好，${name}！很高兴认识你！`,
            spanish: `¡Hola, ${name}! ¡Encantado de conocerte!`,
            french: `Bonjour, ${name}! Enchanté de vous rencontrer!`
        }

        const message = greetings[language] || greetings.english

        return {
            content: [
                {
                    type: 'text',
                    text: message
                }
            ]
        }
    }
)

// Calculator tool - performs basic arithmetic operations
server.tool(
    'calc',
    'Performs basic arithmetic operations on two numbers',
    {
        a: z.number().describe('The first number'),
        b: z.number().describe('The second number'),
        operator: z.enum(['+', '-', '*', '/'])
            .describe('The arithmetic operator to use')
    },
    async ({ a, b, operator }) => {
        let result: number

        switch (operator) {
            case '+':
                result = a + b
                break
            case '-':
                result = a - b
                break
            case '*':
                result = a * b
                break
            case '/':
                if (b === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Error: Division by zero is not allowed'
                            }
                        ]
                    }
                }
                result = a / b
                break
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `${a} ${operator} ${b} = ${result}`
                }
            ]
        }
    }
)

// Time tool - returns current system time
server.tool(
    'time',
    'Returns the current system date and time',
    {},
    async () => {
        const now = new Date()
        
        const formatted = now.toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        })

        return {
            content: [
                {
                    type: 'text',
                    text: `현재 시간: ${formatted}`
                }
            ]
        }
    }
)

// Image generation tool - generates an image from a text prompt
server.tool(
    'generate_image',
    'Generates an image from a text prompt using FLUX.1-schnell model',
    {
        prompt: z.string().describe('The text prompt to generate an image from')
    },
    async ({ prompt }) => {
        // Suppress stdout to prevent HuggingFace client messages from interfering with MCP
        const originalStdoutWrite = process.stdout.write.bind(process.stdout)
        process.stdout.write = () => true

        try {
            const response = await hfClient.textToImage({
                provider: 'auto',
                model: 'black-forest-labs/FLUX.1-schnell',
                inputs: prompt,
                parameters: { num_inference_steps: 5 }
            })

            // Restore stdout
            process.stdout.write = originalStdoutWrite

            // Convert Blob to base64
            const image = response as unknown as Blob
            const arrayBuffer = await image.arrayBuffer()
            const base64Data = Buffer.from(arrayBuffer).toString('base64')

            return {
                content: [
                    {
                        type: 'image',
                        data: base64Data,
                        mimeType: 'image/png',
                        annotations: {
                            audience: ['user'],
                            priority: 0.9
                        }
                    }
                ]
            }
        } catch (error) {
            // Restore stdout in case of error
            process.stdout.write = originalStdoutWrite
            
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error generating image: ${errorMessage}`
                    }
                ]
            }
        }
    }
)

// Server info resource - returns fake server information
server.resource(
    'server-info',
    'server://info',
    async (uri) => {
        const serverInfo = {
            name: 'MCP Demo Server',
            version: '1.0.0',
            status: 'running',
            uptime: '3 days, 14 hours, 22 minutes',
            cpu_usage: '23.5%',
            memory_usage: '1.2GB / 8GB',
            disk_usage: '45.3GB / 256GB',
            active_connections: 42,
            total_requests: 158743,
            environment: 'production',
            region: 'ap-northeast-2',
            last_restart: '2025-11-24T00:15:30Z'
        }

        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(serverInfo, null, 2)
                }
            ]
        }
    }
)

// Code review prompt - provides a structured prompt for code review
server.prompt(
    'code_review',
    'A prompt for reviewing code and providing feedback',
    {
        code: z.string().describe('The code to review'),
        language: z.string().optional().describe('The programming language of the code')
    },
    async ({ code, language }) => {
        const langInfo = language ? `\n- 프로그래밍 언어: ${language}` : ''
        
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `당신은 시니어 소프트웨어 엔지니어입니다. 아래 코드를 리뷰해주세요.

## 리뷰 요청 정보${langInfo}

## 리뷰할 코드
\`\`\`
${code}
\`\`\`

## 리뷰 항목
다음 항목들을 중심으로 코드 리뷰를 진행해주세요:

1. **코드 품질**: 가독성, 명명 규칙, 코드 구조
2. **버그 및 오류**: 잠재적인 버그나 논리적 오류
3. **성능**: 성능 개선이 필요한 부분
4. **보안**: 보안 취약점이 있는지
5. **베스트 프랙티스**: 해당 언어/프레임워크의 권장 사항 준수 여부
6. **개선 제안**: 구체적인 개선 방안 및 수정된 코드 예시

각 항목에 대해 구체적인 피드백과 개선 방안을 제시해주세요.`
                    }
                }
            ]
        }
    }
)

// Start the server
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('MCP Server started')
}

main().catch(console.error)
