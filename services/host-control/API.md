# Host Control API

宿主机控制服务，运行在宿主机 `18800` 端口，供 Docker 容器内的 OpenClaw 实例通过 HTTP 调用。

**Base URL:** `http://<宿主机IP>:18800`

---

## 音量控制

### 获取音量

```
GET /volume
```

**响应示例：**

```json
{ "ok": true, "level": 50, "muted": false }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| level | number | 当前音量 0-100 |
| muted | boolean | 是否静音 |

### 设置音量

```
POST /volume
Content-Type: application/json
```

**请求体：**

```json
{ "level": 50 }
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| level | number | 是 | 目标音量 0-100 |

**响应示例：**

```json
{ "ok": true, "level": 50 }
```

### 静音

```
POST /volume/mute
```

**响应示例：**

```json
{ "ok": true, "muted": true }
```

### 取消静音

```
POST /volume/unmute
```

**响应示例：**

```json
{ "ok": true, "muted": false }
```

---

## 锁屏

### 锁定 Windows

```
POST /lock
```

**响应示例：**

```json
{ "ok": true, "action": "locked" }
```

---

## Clash 代理管理

### 查看状态

```
GET /clash/status
```

**响应示例：**

```json
{
  "ok": true,
  "running": true,
  "mode": "rule",
  "config": {
    "port": 0,
    "socks-port": 0,
    "mixed-port": 7890
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| running | boolean | Clash 是否在运行 |
| mode | string | 当前模式：rule / global / direct |
| config | object | 端口配置（仅 running=true 时返回） |

### 启动 Clash

```
POST /clash/start
```

**响应示例：**

```json
{ "ok": true, "message": "starting" }
```

如果已经在运行：

```json
{ "ok": true, "message": "already running" }
```

### 停止 Clash

```
POST /clash/stop
```

**响应示例：**

```json
{ "ok": true, "message": "stopped" }
```

### 切换模式

```
POST /clash/mode
Content-Type: application/json
```

**请求体：**

```json
{ "mode": "rule" }
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mode | string | 是 | rule / global / direct |

**响应示例：**

```json
{ "ok": true, "mode": "rule" }
```

---

## 通用说明

- 所有响应均为 JSON 格式
- 成功时 `ok: true`，失败时 `ok: false` 并附带 `error` 字段
- 错误响应示例：`{ "ok": false, "error": "错误信息" }`
- `GET /` 返回所有可用端点列表
