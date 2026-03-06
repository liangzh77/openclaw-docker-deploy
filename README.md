# openclaw-docker-deploy

在 Windows 宿主机上使用 Docker 部署 `openclaw:local`，并接入宿主机上的 OpenAI-compatible 模型服务。

这个仓库提供了一套适合本机使用的部署资料，包括：

- 配置模板
- PowerShell 启动脚本
- 更安全的本机版配置建议
- 常见问题排查说明

## 适用环境

适用于以下场景：

- Windows + Docker Desktop
- 宿主机已有 OpenAI-compatible 模型服务
- 模型服务地址类似：`http://localhost:8317`

## 仓库结构

```txt
openclaw-docker-deploy/
├─ README.md
├─ DEPLOY.md
├─ .gitignore
├─ config/
│  └─ openclaw.template.json
└─ scripts/
   ├─ start-openclaw.ps1
   └─ copy-config-and-restart.ps1
```

## Quick Start

### 0. 获取 Docker 镜像

从 GitHub Container Registry 拉取官方镜像并打上本项目使用的标签：

```bash
docker pull ghcr.io/openclaw/openclaw:latest
docker tag ghcr.io/openclaw/openclaw:latest openclaw:local
```

验证：

```bash
docker images openclaw
```

> 也可以指定版本标签，如 `ghcr.io/openclaw/openclaw:2026.2.26`。

### 1. 准备配置文件

复制模板：

```txt
config/openclaw.template.json -> config/openclaw.json
```

填写以下两个值：

- `<YOUR_MODEL_API_KEY>`
- `<YOUR_OPENCLAW_TOKEN>`

> `config/openclaw.json` 是本地运行文件，不应提交到仓库。

### 2. 启动容器

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-openclaw.ps1
```

### 3. 复制配置并重启

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copy-config-and-restart.ps1
```

### 4. 打开浏览器

```txt
http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>
```

如果一切正常，页面通常会进入：

```txt
http://127.0.0.1:18789/chat?session=main
```

## 配置说明

当前推荐使用“更安全的本机版”配置：

- 保留 `gateway.bind = "lan"`
- 保留 `gateway.controlUi.allowedOrigins`
- 使用固定 token
- 默认不启用 `allowInsecureAuth`
- 默认不启用 `dangerouslyDisableDeviceAuth`

关键约束：

- 不要把 OpenClaw 映射到宿主机 `8317`
- 容器访问宿主机模型应使用：`http://host.docker.internal:8317/v1`
- OpenAI provider 和 model 都要显式写 `api: "openai-completions"`

## Troubleshooting

如果遇到以下问题，请直接查看详细文档：

- `ports are not available`
- `origin not allowed`
- `token mismatch`
- `No API provider registered for api: undefined`
- Git Bash 下路径挂载异常
- 安全版本机配置无法登录

详细说明见：[`DEPLOY.md`](./DEPLOY.md)

## Included Files

- `config/openclaw.template.json`：推荐模板
- `scripts/start-openclaw.ps1`：启动容器
- `scripts/copy-config-and-restart.ps1`：复制配置并重启
- `DEPLOY.md`：完整部署与排障说明

## Security Notes

这套配置面向本机使用，不面向公网暴露。

虽然已经比最初调试版更收敛，但如果要用于长期局域网访问或公网访问，仍需要进一步加强鉴权和访问控制。
