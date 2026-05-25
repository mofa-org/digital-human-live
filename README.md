# 数字人直播系统

实时数字人视频生成平台。输入文字或提问，AI 驱动的数字人会开口说话。

**在线体验：** https://dh.mofa.ai

## 功能

- **34 个预设角色** — 覆盖医疗、教育、文化艺术、劳动者、商务科技、生活等类别
- **自由输入** — 输入任意文字，数字人为你朗读
- **AI 对话** — 提问题，Qwen 大模型回答，数字人说出来
- **双引擎** — SadTalker（快速 ~10s）/ MuseTalk（高品质唇形 ~35s）
- **字幕叠加** — 可选在视频上烧入字幕
- **多段拼接** — 多段文字自动生成并拼接为完整视频
- **视频分享** — 生成后一键获取分享链接
- **历史记录** — 保留最近 5 条生成记录
- **暗色模式** — 亮色/暗色主题自由切换
- **移动端适配** — 手机平板均可使用
- **拖拽上传** — 拖拽图片上传自定义角色
- **声线试听** — 选中角色后可预览声音
- **用量统计** — 查看生成次数和热门角色

## 快速开始

### 前提条件

- Python 3.9+
- 能访问 Osaka AI Hub API（`154.17.17.154:18801`）
- OpenAI API Key（用于中文语音合成）
- Osaka API Key（向管理员申请）

### 安装

```bash
git clone https://github.com/mofa-org/digital-human-live.git
cd digital-human-live
pip install -r requirements.txt
```

### 配置

复制环境变量模板并填入你的 key：

```bash
cp .env.example .env
# 编辑 .env，填入两个 API key
```

或者直接导出环境变量：

```bash
export OPENAI_API_KEY="sk-proj-your-key"
export DH_API_KEY="osk-your-key"
```

### 运行

```bash
uvicorn app:app --host 0.0.0.0 --port 8080
```

打开 http://localhost:8080 即可使用。

### 生产部署（macOS launchd）

项目包含 launchd plist 模板：

```bash
# 编辑 plist，填入 API key
vim deploy/com.mofa.digital-human.plist

# 安装为系统服务
cp deploy/com.mofa.digital-human.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.mofa.digital-human.plist
```

服务会自动启动，崩溃后自动重启。

## 架构

```
浏览器 ──→ Cloudflare Tunnel ──→ macmini2:8080 (FastAPI)
                                      │
                                      ├── OpenAI TTS API (中文语音)
                                      │
                                      └── Osaka AI Hub (154.17.17.154:18801)
                                              ├── Qwen3-27B (LLM 对话)
                                              ├── Kokoro TTS (英文语音/试听)
                                              ├── SadTalker (数字人视频)
                                              └── MuseTalk (高品质唇形)
```

**为什么用 OpenAI TTS？** Osaka 内置的 Kokoro TTS 暂不支持中文（读出 "Chinese letter"），所以中文文本走 OpenAI `tts-1-hd` 模型生成语音后，再发给 Osaka 做唇形同步。

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/avatars` | GET | 角色列表（含分类、描述、推荐台词） |
| `/api/avatars/{id}/thumbnail` | GET | 角色缩略图（128x128 WebP） |
| `/api/avatars/{id}/image` | GET | 角色原图 |
| `/api/categories` | GET | 分类列表 |
| `/api/voices` | GET | 可用声线 |
| `/api/chat` | POST | LLM 对话代理 |
| `/api/generate` | POST | 生成数字人视频 |
| `/api/generate-multi` | POST | 多段拼接视频 |
| `/api/tts-preview` | POST | 声线试听 |
| `/api/share` | POST | 上传视频获取分享链接 |
| `/api/shared/{id}` | GET | 访问分享的视频 |
| `/api/stats` | GET | 用量统计 |
| `/api/analytics` | POST | 埋点事件 |
| `/api/health` | GET | 健康检查 |

## 项目结构

```
digital-human-live/
├── app.py                 # FastAPI 后端
├── requirements.txt       # Python 依赖
├── .env.example           # 环境变量模板
├── static/
│   ├── index.html         # 前端页面
│   ├── style.css          # 样式
│   ├── app.js             # 前端逻辑
│   └── favicon.png        # 图标
├── avatars/               # 34 个预设角色头像 (PNG)
├── thumbnails/            # 自动生成的缩略图缓存 (WebP)
├── uploads/               # 用户上传的自定义角色
├── shared/                # 分享的视频文件（7天自动清理）
└── deploy/
    └── com.mofa.digital-human.plist  # macOS launchd 配置
```

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Enter` / `Cmd+Enter` | 生成视频 |
| `Esc` | 关闭侧边栏（移动端） |
| 双击视频 | 全屏播放 |
