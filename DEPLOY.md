# Deploy OpenClaw on Windows with Docker

本文档用于在 Windows 宿主机上部署 `openclaw:local`，并接入宿主机上的 OpenAI-compatible 模型服务。

适用场景：

- 宿主机已有本地模型服务，例如 `http://localhost:8317`
- 需要在 Docker 中运行 OpenClaw
- 需要浏览器可打开 UI，并能实际对话

## 快速部署

### 前提条件

开始前请确认：

1. 已安装 Docker Desktop
2. 宿主机模型服务已启动
3. 模型服务支持 OpenAI-compatible 接口
4. 准备好模型 API key

### 0. 获取 Docker 镜像

从 GitHub Container Registry 拉取官方镜像：

```bash
docker pull ghcr.io/openclaw/openclaw:latest
docker tag ghcr.io/openclaw/openclaw:latest openclaw:local
```

验证镜像已就绪：

```bash
docker images openclaw
```

预期输出：

```txt
REPOSITORY   TAG       IMAGE ID       CREATED        SIZE
openclaw     local     ...            ...            ~4.4GB
```

> 也可以指定版本标签，如 `ghcr.io/openclaw/openclaw:2026.2.26`。
> 镜像源码：https://github.com/openclaw/openclaw

推荐目录结构：

```txt
openclaw-docker-deploy/
├─ README.md
├─ DEPLOY.md
├─ config/
│  └─ openclaw.template.json
└─ scripts/
   ├─ start-openclaw.ps1
   └─ copy-config-and-restart.ps1
```

### 1. 准备配置文件

复制模板：

```txt
config/openclaw.template.json -> config/openclaw.json
```

填写以下两个值：

- `<YOUR_MODEL_API_KEY>`
- `<YOUR_OPENCLAW_TOKEN>`

当前推荐的是“更安全的本机版”配置，特点是：

- 保留 `gateway.bind = "lan"`
- 保留 `gateway.controlUi.allowedOrigins`
- 使用固定 token
- 默认不启用 `allowInsecureAuth`
- 默认不启用 `dangerouslyDisableDeviceAuth`

关键配置示例：

```json
{
  "models": {
    "providers": {
      "openai": {
        "baseUrl": "http://host.docker.internal:8317/v1",
        "apiKey": "<YOUR_MODEL_API_KEY>",
        "api": "openai-completions",
        "models": [
          {
            "id": "gpt-5.4",
            "name": "gpt-5.4",
            "api": "openai-completions"
          },
          {
            "id": "gpt-5-codex-mini",
            "name": "gpt-5-codex-mini",
            "api": "openai-completions"
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-5.4"
      },
      "compaction": {
        "mode": "safeguard"
      }
    }
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true,
    "ownerDisplay": "raw"
  },
  "gateway": {
    "bind": "lan",
    "controlUi": {
      "allowedOrigins": [
        "http://127.0.0.1:18789",
        "http://localhost:18789"
      ]
    },
    "auth": {
      "mode": "token",
      "token": "<YOUR_OPENCLAW_TOKEN>"
    }
  }
}
```

### 2. 启动容器

执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-openclaw.ps1
```

等价核心命令：

```bash
docker rm -f openclaw

docker run -d --name openclaw \
  --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 18789:18789 \
  -p 18790:18790 \
  openclaw:local
```

### 3. 复制配置并重启

执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copy-config-and-restart.ps1
```

等价核心命令：

```bash
docker exec openclaw sh -lc "mkdir -p /home/node/.openclaw"
docker cp .\config\openclaw.json openclaw:/home/node/.openclaw/openclaw.json
docker restart openclaw
```

### 4. 打开浏览器

访问：

```txt
http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>
```

如果正常，页面通常会进入：

```txt
http://127.0.0.1:18789/chat?session=main
```

### 5. 验证部署是否成功

检查容器：

```bash
docker ps --filter "name=openclaw"
```

检查模型状态：

```bash
docker exec openclaw sh -lc "node openclaw.mjs models status --plain"
```

预期输出：

```txt
openai/gpt-5.4
```

在 UI 中发送：

```txt
你好，请只回复：测试成功
```

如果收到：

```txt
测试成功
```

则表示整条链路可用。

## 故障排查

### 1. `ports are not available`

原因：宿主机端口被占用，最常见的是 `8317` 已被本地模型服务占用。

处理方式：

- 不要把 OpenClaw 映射到宿主机 `8317`
- 只保留：
  - `18789:18789`
  - `18790:18790`

错误示例：

```bash
docker run -d --name openclaw -p 8317:8317 ...
```

### 2. 容器无法访问宿主机模型

原因：容器中的 `localhost` 指向容器本身，不是 Windows 宿主机。

正确地址：

```txt
http://host.docker.internal:8317/v1
```

可用以下命令验证：

```bash
docker exec openclaw sh -lc "curl -sS http://host.docker.internal:8317/"
```

如果需要带 API key：

```bash
docker exec openclaw sh -lc "curl -sS -H 'Authorization: Bearer <YOUR_MODEL_API_KEY>' http://host.docker.internal:8317/v1/models"
```

### 3. 浏览器打开是空响应或页面无法访问

原因：Gateway 只绑定在容器内部 loopback。

确认配置中包含：

```json
"gateway": {
  "bind": "lan"
}
```

可用以下命令检查根页面：

```bash
curl -i http://127.0.0.1:18789/
```

### 4. `origin not allowed`

原因：Control UI Origin 未加入允许列表。

确认配置中包含：

```json
"controlUi": {
  "allowedOrigins": [
    "http://127.0.0.1:18789",
    "http://localhost:18789"
  ]
}
```

### 5. `token mismatch`

原因通常是：

- 浏览器里使用了旧 token
- 配置文件中的 token 和访问 URL 不一致
- 浏览器缓存了旧状态

处理方式：

1. 确认 `config/openclaw.json` 中的 token
2. 确认访问地址为：

```txt
http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>
```

3. 使用无痕窗口或清理缓存后重试

### 6. `No API provider registered for api: undefined`

原因：OpenAI provider 或 model 缺少显式 `api` 字段。

确认 provider 和 model 都包含：

```json
"api": "openai-completions"
```

### 7. Git Bash 下单文件挂载异常

原因：Windows 路径在 Git Bash 下可能被路径转换机制改坏。

建议：

- 首次部署优先使用 PowerShell 脚本
- 单文件配置优先使用 `docker cp`
- 不要依赖 Git Bash 下的 `-v C:\...:/path` 单文件挂载

### 8. 安全版本机配置仍然无法登录

建议按以下顺序排查：

1. 确认 token 完全一致
2. 确认 `allowedOrigins` 配置正确
3. 确认使用的是 `127.0.0.1` 或 `localhost` 访问
4. 清理浏览器缓存或无痕模式测试

只有在确认当前 OpenClaw 版本确实必须依赖更宽松认证时，才考虑临时恢复额外危险开关，而且仅限本机调试，不要用于公网。

## 附：关键事实

- OpenClaw 不应映射到宿主机 `8317`
- 容器访问宿主机模型应使用：`http://host.docker.internal:8317/v1`
- 当前验证通过的默认模型：`openai/gpt-5.4`
- 当前推荐模板：`config/openclaw.template.json`
- 本仓库不会提交真实的 `config/openclaw.json`
