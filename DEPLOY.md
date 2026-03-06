# OpenClaw Docker 部署记录（Windows 宿主机 + Docker）

本文记录把 `openclaw:local` 跑到可在浏览器中打开并实际对话的全过程，目标是以后在另一台机器上从头复现。

## 1. 本次部署的最终状态

- 容器名：`openclaw`
- 镜像：`openclaw:local`
- 宿主机模型服务：`http://localhost:8317`
- OpenClaw 在容器内访问模型服务：`http://host.docker.internal:8317/v1`
- OpenClaw 对外端口：
  - `18789`：Control UI / Gateway
  - `18790`：额外暴露端口
- 最终验证结果：
  - 浏览器可以打开 OpenClaw Control UI
  - UI 中可以实际发消息并得到回复
  - 默认模型已切到 `openai/gpt-5.4`

---

## 2. 关键结论

### 2.1 不要把 OpenClaw 也映射到宿主机 `8317`

原因：宿主机的 `8317` 已经被你的大模型服务占用。

错误做法：

```bash
docker run -d --name openclaw -p 8317:8317 ...
```

会报：

- `bind: Only one usage of each socket address ... is normally permitted`

### 2.2 容器内不能用 `localhost:8317` 访问宿主机模型

在容器里：

- `localhost` 指向容器自己，不是 Windows 宿主机

正确地址：

```txt
http://host.docker.internal:8317
```

如果是 OpenAI-compatible 服务，最终应写成：

```txt
http://host.docker.internal:8317/v1
```

### 2.3 你的 8317 服务是 OpenAI-compatible，不是 Anthropic 协议

已探测到：

- `POST /v1/chat/completions`
- `POST /v1/completions`
- `GET /v1/models`

所以 OpenClaw 里要按 **OpenAI provider** 配，而不是 `ANTHROPIC_*`。

### 2.4 OpenClaw 需要显式允许本地浏览器 Origin

否则 UI 会报：

```txt
origin not allowed (open the Control UI from the gateway host or allow it in gateway.controlUi.allowedOrigins)
```

### 2.5 Git Bash 下 `docker run -v C:\...:/path` 容易被路径转换搞坏

这次实际踩到了这个坑。Docker inspect 看到错误 bind：

- Source 被截断
- Destination 被改成了 Git Bash 自己的路径

因此：

- **推荐不要在 Git Bash 下用 Windows 风格文件挂载做首次部署**
- 更稳的方式是：
  1. 先启动容器
  2. 再用 `docker cp` 把配置文件复制进去
  3. 然后重启容器

---

## 3. 前置条件

1. Windows 已安装 Docker Desktop
2. 宿主机本地大模型服务已经启动，地址：

```txt
http://localhost:8317
```

3. 模型服务是 OpenAI-compatible，并支持：

```txt
GET /v1/models
POST /v1/chat/completions
```

4. 你已经有 `openclaw:local` 镜像

检查：

```bash
docker images | grep openclaw
```

如果没有，需要先在另一台机器上按你自己的方式 build / load 到本地，目标镜像名保持为：

```txt
openclaw:local
```

> 本次会话里没有执行下载/构建镜像步骤；使用的是已经存在的本地镜像 `openclaw:local`。

---

## 4. 部署目录建议

建议在目标机器上准备一个固定目录，例如：

```txt
C:\openclaw-deploy
```

目录结构建议：

```txt
C:\openclaw-deploy
├─ config
│  └─ openclaw.json
└─ scripts
   ├─ start-openclaw.ps1
   └─ copy-config-and-restart.ps1
```

---

## 5. 第一次启动容器（不挂配置文件）

先让容器跑起来：

```bash
docker rm -f openclaw

docker run -d --name openclaw \
  --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 18789:18789 \
  -p 18790:18790 \
  openclaw:local
```

说明：

- `--add-host=host.docker.internal:host-gateway` 让 Linux 容器能访问 Windows 宿主机
- 不映射 `8317`
- `--restart unless-stopped` 保证容器重启后自动恢复

检查状态：

```bash
docker ps --filter "name=openclaw"
```

---

## 6. 验证容器能访问宿主机模型

先验证容器内到宿主机模型的网络是通的：

```bash
docker exec openclaw sh -lc "curl -sS http://host.docker.internal:8317/"
```

如果你的模型服务要求 API key，再验证：

```bash
docker exec openclaw sh -lc "curl -sS -H 'Authorization: Bearer <YOUR_MODEL_API_KEY>' http://host.docker.internal:8317/v1/models"
```

预期：能返回模型列表。

---

## 7. 写入最终配置文件

把下面的模板保存为：

```txt
config/openclaw.json
```

> 注意：把 `<YOUR_MODEL_API_KEY>` 换成你自己的 key。

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

### 字段说明

- `models.providers.openai.baseUrl`
  - 指向宿主机模型服务
- `api = openai-completions`
  - 这是这次跑通的关键字段之一
- `gateway.bind = lan`
  - 否则容器内只会监听 127.0.0.1，宿主机打开网页可能是空响应
- `gateway.controlUi.allowedOrigins`
  - 只允许本机 UI 的 Origin，解决 `origin not allowed`
- `gateway.auth.token`
  - 手工设置你自己的固定 token，避免随机 token / token mismatch
- 不再启用 `allowInsecureAuth` 和 `dangerouslyDisableDeviceAuth`
  - 这是更安全的本机版默认值，优先先用这套

---

## 8. 把配置文件复制进容器

推荐使用 `docker cp`，不要依赖 Git Bash 的 `-v` 文件挂载。

```bash
docker exec openclaw sh -lc "mkdir -p /home/node/.openclaw"
docker cp .\config\openclaw.json openclaw:/home/node/.openclaw/openclaw.json
```

如果在 PowerShell 中：

```powershell
docker exec openclaw sh -lc "mkdir -p /home/node/.openclaw"
docker cp .\config\openclaw.json openclaw:/home/node/.openclaw/openclaw.json
```

复制完成后重启：

```bash
docker restart openclaw
```

---

## 9. 浏览器访问地址

最终稳定可用的地址：

```txt
http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>
```

打开后前端通常会跳到：

```txt
http://127.0.0.1:18789/chat?session=main
```

---

## 10. 实际验证方式

### 10.1 验证根页面

```bash
curl -i http://127.0.0.1:18789/
```

预期：返回 `200 OK` 和 HTML 页面。

### 10.2 验证 dashboard URL

```bash
docker exec openclaw sh -lc "node openclaw.mjs dashboard --no-open"
```

### 10.3 验证模型状态

```bash
docker exec openclaw sh -lc "node openclaw.mjs models status --plain"
```

预期：

```txt
openai/gpt-5.4
```

### 10.4 验证真实对话

在 UI 中发：

```txt
你好，请只回复：测试成功
```

本次实际得到回复：

```txt
测试成功
```

---

## 11. 这次排障中遇到的问题与对应修复

### 问题 1：容器起不来，8317 端口占用

现象：

```txt
ports are not available ... 0.0.0.0:8317 ... bind
```

原因：

- 宿主机 `8317` 已经被本地模型服务占用

修复：

- 去掉 `-p 8317:8317`
- OpenClaw 改为访问 `host.docker.internal:8317`

---

### 问题 2：容器里访问 `localhost:8317` 失败

原因：

- 容器里的 `localhost` 不是宿主机

修复：

- 改成 `http://host.docker.internal:8317`

---

### 问题 3：浏览器打开页面是空响应 `ERR_EMPTY_RESPONSE`

原因：

- gateway 只绑定在容器内部 loopback

修复：

```json
"gateway": {
  "bind": "lan"
}
```

---

### 问题 4：UI 报 `origin not allowed`

修复：

```json
"gateway": {
  "controlUi": {
    "allowedOrigins": [
      "http://127.0.0.1:18789",
      "http://localhost:18789"
    ]
  }
}
```

---

### 问题 5：UI 报 token mismatch

原因：

- gateway token 随重启变化 / 浏览器缓存旧 token

修复：

固定：

```json
"gateway": {
  "auth": {
    "mode": "token",
    "token": "openclaw-local-fixed-token-20260306"
  }
}
```

然后始终使用：

```txt
http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>
```

---

### 问题 6：发送消息时报 `No API provider registered for api: undefined`

原因：

- OpenAI provider / model 缺少显式 `api` 字段

修复：

给 provider 和 model 都补：

```json
"api": "openai-completions"
```

---

### 问题 7：Git Bash 下 `-v` 挂载路径异常

原因：

- Windows 路径 + Git Bash 路径转换导致 `:` 被错误处理

修复：

- 首次部署尽量不用 `-v` 挂单文件
- 改用 `docker cp`

---

## 12. 推荐的最小复现步骤（另一台机器）

### Step 1
确保：

- Docker Desktop 正常
- 本地模型服务已经跑在 `http://localhost:8317`
- 本地已有 `openclaw:local` 镜像

### Step 2
启动 OpenClaw 容器：

```bash
docker rm -f openclaw

docker run -d --name openclaw \
  --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 18789:18789 \
  -p 18790:18790 \
  openclaw:local
```

### Step 3
把 `config/openclaw.json` 复制进去：

```bash
docker exec openclaw sh -lc "mkdir -p /home/node/.openclaw"
docker cp .\config\openclaw.json openclaw:/home/node/.openclaw/openclaw.json
```

### Step 4
重启容器：

```bash
docker restart openclaw
```

### Step 5
浏览器打开：

```txt
http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>
```

### Step 6
发一句测试消息：

```txt
你好，请只回复：测试成功
```

如果返回：

```txt
测试成功
```

则部署成功。

---

## 13. 更安全的本机版配置

优先推荐使用仓库里的模板文件：

```txt
config/openclaw.template.json
```

这份模板已经按“更安全的本机版”整理，原则是：

- 保留 `gateway.bind = "lan"`，否则宿主机浏览器可能无法访问容器里的 UI
- 保留 `allowedOrigins`，只允许本机访问 UI
- 保留 `auth.mode = "token"`
- 继续要求显式 token，但改为你自己填写 `"<YOUR_OPENCLAW_TOKEN>"`
- 去掉 `allowInsecureAuth`
- 去掉 `dangerouslyDisableDeviceAuth`

建议做法：

1. 复制模板：

```txt
config/openclaw.template.json -> config/openclaw.json
```

2. 填两个值：

- `<YOUR_MODEL_API_KEY>`
- `<YOUR_OPENCLAW_TOKEN>`

其中 token 建议：

- 足够长
- 随机
- 不要复用别的系统口令

例如可以自己生成一个 32 字节以上的随机字符串。

### 如果安全版仍然无法登录 UI

先不要立刻暴露到局域网或公网，也不要恢复所有危险开关。建议按这个顺序排查：

1. 确认浏览器访问地址中的 token 与 `config/openclaw.json` 完全一致
2. 确认访问地址是：

```txt
http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>
```

3. 确认 `allowedOrigins` 中包含：

- `http://127.0.0.1:18789`
- `http://localhost:18789`

4. 先清浏览器缓存或无痕模式重试

只有当你确认当前 OpenClaw 版本在本机 UI 上确实必须依赖放宽认证时，再单独评估是否临时恢复相关开关，而且只用于本机调试。

---

## 14. 本次部署成功时的关键访问地址

- OpenClaw UI：

```txt
http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>
```

- 宿主机模型服务：

```txt
http://localhost:8317
```

- 容器内模型地址：

```txt
http://host.docker.internal:8317/v1
```

---

## 15. 建议一起保存的文件

建议把以下文件一起保存到仓库：

- `DEPLOY.md`
- `config/openclaw.json`（注意替换或去掉真实 API key）
- 启动脚本

如果准备提交到 GitHub，**不要提交真实模型 API key**。
