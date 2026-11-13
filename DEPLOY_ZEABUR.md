# 部署到 Zeabur（国内用户可访问）

EdgeOne 在国内打不开，改用 **Zeabur**：香港/新加坡节点、大陆直连可访问、免实名、GitHub 自动部署，原生支持 Next.js。

> 本仓库已配置：`output: "standalone"`、`npm run build` / `npm run start`、`engines.node >= 20`。

## 1. 创建服务（一次性）

1. 注册 [zeabur.com](https://zeabur.com)（支持中文）。
2. 新建 **Project**，进入后 **Add Service → Deploy from GitHub**。
3. 授权 GitHub，选中 `alanpung/jubeidanci`，分支选 `main`。
4. Zeabur 会自动识别为 Next.js，使用 `npm install` → `npm run build` → `npm run start`。
   - 默认会分配一个 `*.zeabur.app` 域名，国内直接可访问（无需备案）。

## 2. 加数据库（服务启动必需）

`instrumentation.ts` 在**服务启动时跑 Drizzle 迁移**，所以必须给 `DATABASE_URL`，否则启动会报错。

- 在 Zeabur 该服务里 **Add Add-on → PostgreSQL**（有免费额度），它会自动注入 `DATABASE_URL` 环境变量。
- 或手动填你自己的 Postgres 连接串。
- 建议**先加好数据库再加其他变量并部署**，保证构建/启动时 `DATABASE_URL` 已存在。

## 3. 环境变量（Variables）

### 必须
| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | 由 Zeabur Postgres 插件自动注入 |
| `BETTER_AUTH_SECRET` | 随便一段随机字符串（如 `openssl rand -hex 32` 生成） |
| `BETTER_AUTH_URL` | `https://你的域名` |
| `APP_URL` | `https://你的域名` |
| `NEXT_PUBLIC_APP_URL` | `https://你的域名` |

### 写作 AI 批改（核心功能）
| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | **推荐排第一**：国内快、免费额度足 |
| `QWEN_API_KEY` | 可选：通义千问（也可用 `DASHSCOPE_API_KEY`） |
| `GEMINI_API_KEY` | 可选：作兜底（也兼容 `GOOGLE_AI_API_KEY`） |
| `OPENAI_API_KEY` | 可选 |
| `AI_PROVIDER_ORDER` | 设为 `deepseek,qwen,gemini`，**把国产 AI 排前面**，Gemini 兜底 |

> 没配任何 AI key 时，写作评分会自动走本地「只扣语法」兜底（`markWriting`），不会报错。

### 可选（不配也能跑）
`R2_*`、`RESEND_*`、`AUTH_GOOGLE_*`、`EXA_API_KEY`、`JINA_API_KEY`、`SLACK_WEBHOOK` 等按需填。

## 4. Node 版本

本仓库 `package.json` 已加：
```json
"engines": { "node": ">=20" }
```
Zeabur 会据此使用 Node 20。若想手动指定，也可在 Zeabur 服务设置的 Build 环境里选 Node 20。

## 5. 部署后

- 打开 `https://<你的项目>.zeabur.app` 即可访问，国内直连。
- 绑自己的域名：在 Zeabur 绑域名即可（默认走香港节点，**无需 ICP 备案**；只有用大陆节点才需备案）。
- AI 批改是否生效：提交一篇作文，看返回是否带 AI 反馈；若只显示「基础评分（AI 批改暂不可用）」说明 key 没配或对应 AI 限流，会自动走本地兜底或下一个 provider。

## 已验证
- `tsc --noEmit` 类型检查通过。
- `grade-writing` 路由支持多 AI 依次尝试 + 本地兜底（见 `app/api/grade-writing/route.ts`）。
- 生产构建（`npm run build`）已在本机跑通。
