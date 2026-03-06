# OpenClaw Docker 部署记录（Windows + Docker Desktop）

本文记录从本地镜像启动 OpenClaw，到修复 UI、模型接入、网页聊天可用的完整过程，目标是方便在另一台机器上从头复现。

## 1. 部署目标

在 Windows 主机上运行一个 Docker 容器 `openclaw`，并让它：

- 对外提供 OpenClaw Web UI
- 能通过浏览器打开聊天页面
- 能调用宿主机上的 OpenAI-compatible 大模型服务
- 最终可通过网页正常对话

本次实际接入的大模型服务特征：

- 宿主机地址：`http://localhost:8317`
- 容器内访问宿主机地址：`http://host.docker.internal:8317`
- 接口协议：**OpenAI-compatible**
- 已验证端点：
  - `GET /v1/models`
  - `POST /v1/chat/completions`

---

## 2. 前提条件

目标机器需要具备：

1. Windows + Docker Desktop
2. 本地已有 `openclaw` 镜像，或能自己构建/加载镜像
3. 宿主机已有一个可用的大模型服务，监听：
   - `http://localhost:8317`
4. 该模型服务支持 OpenAI-compatible 接口
5. 准备一个有效 API Key

---

## 3. 关键结论

### 3.1 不要把 OpenClaw 映射到宿主机 8317

原因：宿主机 `8317` 已经被本地模型服务占用。

所以 OpenClaw **不应该**再使用：

```bash
docker run ... -p 8317:8317 ...
```

否则会启动失败，报端口冲突。

### 3.2 容器里不能用 `localhost:8317` 访问宿主机模型

在 Docker 容器里：

- `localhost` 指向容器自己
- 不是 Windows 主机

因此，OpenClaw 连接宿主机模型时，必须用：

```txt
http://host.docker.internal:8317/v1
```

### 3.3 这个模型后端不是 Anthropic API，而是 OpenAI-compatible API

不要按 `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` 的思路配。

应该按 **OpenAI provider** 配置。

---

## 4. 首次排障过程总结

### 问题 1：容器起不来

最初运行：

```bash
docker run -d --name openclaw -p 8317:8317 -p 18789:18789 -p 18790:18790 openclaw:local
```

现象：容器停留在 `Created`。

原因：宿主机 `8317` 已被其他进程占用。

结论：去掉 `-p 8317:8317`。

---

### 问题 2：OpenClaw 默认模型不是本地模型

起容器后，OpenClaw 默认还是：

```txt
anthropic/claude-opus-4-6
```

原因：没有正确写入 OpenAI provider 配置。

解决：写入 `models.providers.openai`，并设置：

- `baseUrl`
- `apiKey`
- `api`
- `models`
- `agents.defaults.model.primary`

---

### 问题 3：网页能打开，但访问不到 UI

现象：

- `http://127.0.0.1:18789/` 最开始返回空响应
- Playwright 打开页面时报 `ERR_EMPTY_RESPONSE`

原因：OpenClaw gateway 只绑定在容器内 loopback。

解决：

```json
"gateway": {
  "bind": "lan"
}
```

---

### 问题 4：页面能打开，但报 `origin not allowed`

现象：Web UI 打开后，WebSocket 被拒绝。

解决：补充：

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

更安全的本机版里，不再默认开启额外放宽认证的危险开关。

推荐优先保留：

- `allowedOrigins`
- `auth.mode = token`
- 自定义固定 token

只有在你确认当前 OpenClaw 版本的本机 UI 确实必须依赖放宽认证时，才临时单独评估是否恢复相关开关，而且不要用于公网。

---

### 问题 5：页面能打开，但聊天报错

现象：日志里有两类错误：

1. `gateway token mismatch`
2. `No API provider registered for api: undefined`

解决：

#### A. 固定 gateway token

```json
"gateway": {
  "auth": {
    "mode": "token",
    "token": "YOUR_FIXED_TOKEN"
  }
}
```

#### B. 显式补 `api` 字段

OpenClaw 的 OpenAI provider 不能只写 `baseUrl + apiKey`，还需要：

```json
"api": "openai-completions"
```

并且模型项里也要写：

```json
{
  "id": "gpt-5.4",
  "name": "gpt-5.4",
  "api": "openai-completions"
}
```

---

## 5. 最终可用配置

参考 `openclaw.template.json`。

如果你在当前仓库里使用更新后的目录结构，也优先参考：

- `config/openclaw.template.json`

关键字段：

- 模型服务地址：`http://host.docker.internal:8317/v1`
- 默认模型：`openai/gpt-5.4`
- UI 允许来源：`127.0.0.1:18789` 和 `localhost:18789`
- 固定 token 登录

---

## 6. 推荐目录结构

```txt
openclaw-docker-deploy/
  DEPLOYMENT.md
  openclaw.template.json
  run-openclaw.ps1
  run-openclaw.sh
```

---

## 7. 部署步骤（新机器）

### 第一步：准备模板配置

复制：

- `openclaw.template.json`

改名为：

- `openclaw.json`

并替换以下占位符：

- `__OPENAI_API_KEY__`
- `__OPENCLAW_TOKEN__`

如果你的模型地址不是 `8317`，也改掉：

- `http://host.docker.internal:8317/v1`

---

### 第二步：启动容器

#### PowerShell 推荐

```powershell
powershell -ExecutionPolicy Bypass -File .\run-openclaw.ps1
```

#### Git Bash / bash 可用

```bash
bash ./run-openclaw.sh
```

---

### 第三步：打开网页

```txt
http://127.0.0.1:18789/#token=你的固定token
```

建议使用你自己生成的随机 token，不要复用旧 token。

---

## 8. 启动后验证

### 8.1 检查容器状态

```bash
docker ps --filter "name=openclaw"
```

### 8.2 检查日志

```bash
docker logs --tail 100 openclaw
```

成功时应看到类似：

```txt
[gateway] agent model: openai/gpt-5.4
[gateway] listening on ws://0.0.0.0:18789
```

### 8.3 浏览器验证

打开：

```txt
http://127.0.0.1:18789/#token=你的固定token
```

如果一切正常，页面会进入：

```txt
/chat?session=main
```

---

## 9. 常见问题

### Q1：`ports are not available`

说明宿主机端口被占用。

- 不要把 OpenClaw 绑定到 `8317`
- 只保留：
  - `18789:18789`
  - `18790:18790`

### Q2：`origin not allowed`

补：

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

### Q3：`token mismatch`

不要用旧的 dashboard token。

请使用配置文件中固定的：

```json
"gateway": {
  "auth": {
    "mode": "token",
    "token": "你的token"
  }
}
```

### Q4：`No API provider registered for api: undefined`

说明 provider 或 model 缺少：

```json
"api": "openai-completions"
```

### Q5：Git Bash 挂载 Windows 文件路径失败

如果你在 Git Bash 下直接写：

```bash
-v /c/...:/home/node/...
```

有概率被路径转换搞坏。

所以建议：

- Windows 下优先使用 `run-openclaw.ps1`
- 或者在 bash 脚本里用 `cygpath -w`

---

## 10. 安全说明

当前推荐的是更安全的本机版：

- 保留 `gateway.bind = lan`
- 保留 `gateway.controlUi.allowedOrigins`
- 保留 `gateway.auth.mode = token`
- 使用你自己填写的固定 token
- 默认不启用 `gateway.controlUi.allowInsecureAuth`
- 默认不启用 `gateway.controlUi.dangerouslyDisableDeviceAuth`

这意味着：

- 适合本机使用
- 比之前的调试版更收敛
- 仍然**不建议直接暴露到公网**

如果以后要做局域网长期使用或公网访问，还应继续加强鉴权和访问控制。

---

## 11. 本次验证结果

最终已实测：

- OpenClaw Web UI 可以打开
- 使用固定 token 可进入聊天页面
- 向页面发送：

```txt
你好，请只回复：测试成功
```

实际收到回复：

```txt
测试成功
```

说明整条链路已经可用。
