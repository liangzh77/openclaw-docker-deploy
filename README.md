# openclaw-docker-deploy

用于在 Windows 宿主机上以 Docker 方式部署 `openclaw:local`，并接入宿主机上的 OpenAI-compatible 模型服务。

## 仓库内容

- `DEPLOY.md`：完整部署记录、排障过程和更安全的本机版配置说明
- `config/openclaw.template.json`：推荐使用的配置模板
- `scripts/start-openclaw.ps1`：启动 OpenClaw 容器
- `scripts/copy-config-and-restart.ps1`：复制配置到容器并重启

## 快速开始

1. 复制配置模板：
   - `config/openclaw.template.json` -> `config/openclaw.json`
2. 填写：
   - `<YOUR_MODEL_API_KEY>`
   - `<YOUR_OPENCLAW_TOKEN>`
3. 启动容器：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\start-openclaw.ps1`
4. 复制配置并重启：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\copy-config-and-restart.ps1`
5. 浏览器打开：
   - `http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>`

## 关键说明

- 不要把 OpenClaw 映射到宿主机 `8317`
- 容器访问宿主机模型应使用：`http://host.docker.internal:8317/v1`
- 当前推荐配置是“更安全的本机版”：
  - 保留 `allowedOrigins`
  - 使用固定 token
  - 默认不启用 `allowInsecureAuth`
  - 默认不启用 `dangerouslyDisableDeviceAuth`

## 详细文档

请看：[`DEPLOY.md`](./DEPLOY.md)
