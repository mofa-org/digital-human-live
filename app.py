import asyncio
import json
import os
import tempfile
import uuid
from pathlib import Path

import httpx
import imageio_ffmpeg
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from starlette.middleware.base import BaseHTTPMiddleware

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

BASE = Path(__file__).parent
AVATARS_DIR = BASE / "avatars"
UPLOADS_DIR = BASE / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
THUMBNAILS_DIR = BASE / "thumbnails"
THUMBNAILS_DIR.mkdir(exist_ok=True)
META_FILE = UPLOADS_DIR / "metadata.json"

DH_API = "http://154.17.17.154:18801"
OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech"
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")

CATEGORIES = ["医疗健康", "教育", "文化艺术", "劳动者", "商务科技", "生活"]

PRESETS = [
    {"id": "lingnan_uncle", "name": "岭南大叔", "file": "lingnan_uncle.png", "voice": "onyx", "gender": "male",
     "category": "生活", "desc": "50 岁广东老街坊", "samples": ["今天带大家品品正宗广州早茶", "来来来，饮啖茶先"]},
    {"id": "shenzhen_student", "name": "深圳中学生", "file": "shenzhen_student.png", "voice": "shimmer", "gender": "female",
     "category": "生活", "desc": "15 岁活泼女生", "samples": ["同学们好！今天聊聊科技创新", "暑假我参加了编程夏令营"]},
    {"id": "news_anchor", "name": "新闻主播", "file": "news_anchor.png", "voice": "nova", "gender": "female",
     "category": "商务科技", "desc": "30 岁专业女主播", "samples": ["观众朋友们好，欢迎收看今天的新闻", "接下来是一则重要报道"]},
    {"id": "tech_engineer", "name": "IT工程师", "file": "tech_engineer.png", "voice": "echo", "gender": "male",
     "category": "商务科技", "desc": "28 岁码农小王", "samples": ["今天来聊聊大模型的最新进展", "这个 bug 我找了三天终于搞定了"]},
    {"id": "retired_professor", "name": "退休教授", "file": "retired_professor.png", "voice": "onyx", "gender": "male",
     "category": "教育", "desc": "65 岁历史学者", "samples": ["让我们回顾一下这段波澜壮阔的历史", "读书破万卷，下笔如有神"]},
    {"id": "college_girl", "name": "大学生小林", "file": "college_girl.png", "voice": "nova", "gender": "female",
     "category": "教育", "desc": "20 岁开朗学姐", "samples": ["学弟学妹们，选课有什么想问的吗？", "大学四年最重要的是找到自己的方向"]},
    {"id": "fitness_coach", "name": "健身教练", "file": "fitness_coach.png", "voice": "echo", "gender": "male",
     "category": "生活", "desc": "32 岁运动达人", "samples": ["来！今天做三组深蹲，跟我一起动", "健身不只是练肌肉，更是练意志力"]},
    {"id": "doctor_li", "name": "李医生", "file": "doctor_li.png", "voice": "nova", "gender": "female",
     "category": "医疗健康", "desc": "38 岁温柔医师", "samples": ["别紧张，我来给你解释一下检查结果", "预防胜于治疗，记得定期体检"]},
    {"id": "hip_hop_youth", "name": "说唱少年", "file": "hip_hop_youth.png", "voice": "echo", "gender": "male",
     "category": "生活", "desc": "22 岁地下说唱", "samples": ["这首歌献给所有追梦的年轻人", "我的音乐就是我的态度"]},
    {"id": "business_woman", "name": "商务总监", "file": "business_woman.png", "voice": "nova", "gender": "female",
     "category": "商务科技", "desc": "42 岁职场精英", "samples": ["这个季度的业绩目标，我们一起看看", "谈判的关键是找到双赢的方案"]},
    {"id": "grandma_chen", "name": "陈奶奶", "file": "grandma_chen.png", "voice": "shimmer", "gender": "female",
     "category": "生活", "desc": "75 岁慈祥老人", "samples": ["孩子们，奶奶给你们讲个故事", "做人啊，最重要的就是善良"]},
    {"id": "child_host", "name": "小小主持人", "file": "child_host.png", "voice": "alloy", "gender": "male",
     "category": "教育", "desc": "10 岁阳光少年", "samples": ["大家好！我是今天的小主持人", "接下来请欣赏我的才艺表演"]},
    {"id": "yoga_teacher", "name": "瑜伽老师", "file": "yoga_teacher.png", "voice": "shimmer", "gender": "female",
     "category": "生活", "desc": "30 岁身心教练（半身）", "samples": ["深呼吸，感受当下的平静", "今天的主题是肩颈放松"]},
    {"id": "street_musician", "name": "街头歌手", "file": "street_musician.png", "voice": "echo", "gender": "male",
     "category": "文化艺术", "desc": "25 岁独立音乐人（全身）", "samples": ["这首歌送给每一个在路上的人", "音乐不需要舞台，哪里都可以唱"]},
    {"id": "chef_wang", "name": "王大厨", "file": "chef_wang.png", "voice": "onyx", "gender": "male",
     "category": "生活", "desc": "45 岁川菜大师（半身）", "samples": ["今天教大家做一道正宗的麻婆豆腐", "火候是厨艺的灵魂"]},
    {"id": "nurse_zhang", "name": "张护士", "file": "nurse_zhang.png", "voice": "nova", "gender": "female",
     "category": "医疗健康", "desc": "28 岁温暖守护者", "samples": ["别怕，打针一点都不疼", "记得按时吃药，早日康复"]},
    {"id": "kindergarten_teacher", "name": "幼儿园老师", "file": "kindergarten_teacher.png", "voice": "shimmer", "gender": "female",
     "category": "教育", "desc": "25 岁孩子王", "samples": ["小朋友们，今天我们来画画吧", "每个孩子都是独一无二的星星"]},
    {"id": "farmer_uncle", "name": "老农大伯", "file": "farmer_uncle.png", "voice": "onyx", "gender": "male",
     "category": "劳动者", "desc": "55 岁稻田守望者", "samples": ["今年的稻子长势不错", "种地这事，急不来，得看天"]},
    {"id": "firefighter", "name": "消防战士", "file": "firefighter.png", "voice": "echo", "gender": "male",
     "category": "劳动者", "desc": "30 岁逆行英雄", "samples": ["我们的使命是保护每一个人的安全", "火灾预防比救火更重要"]},
    {"id": "delivery_rider", "name": "外卖小哥", "file": "delivery_rider.png", "voice": "echo", "gender": "male",
     "category": "劳动者", "desc": "28 岁城市骑手（半身）", "samples": ["您的订单马上就到", "风里雨里，我们一直在路上"]},
    {"id": "elderly_calligrapher", "name": "书法老人", "file": "elderly_calligrapher.png", "voice": "onyx", "gender": "male",
     "category": "文化艺术", "desc": "75 岁翰墨传承人", "samples": ["写字如做人，一笔一划都要端正", "这幅字送给有缘人"]},
    {"id": "deaf_artist", "name": "无声画家", "file": "deaf_artist.png", "voice": "shimmer", "gender": "female",
     "category": "文化艺术", "desc": "29 岁听障艺术家", "samples": ["我的画笔就是我的声音", "色彩能传达语言无法表达的情感"]},
    {"id": "taxi_driver", "name": "出租车师傅", "file": "taxi_driver.png", "voice": "onyx", "gender": "male",
     "category": "劳动者", "desc": "50 岁城市百科全书", "samples": ["我开了二十年出租，这城市的故事都装在车里", "上车吧，我带你抄近路"]},
    {"id": "tea_master", "name": "茶艺师", "file": "tea_master.png", "voice": "nova", "gender": "female",
     "category": "文化艺术", "desc": "42 岁传统文化守护者", "samples": ["品茶如品人生，需要慢慢体会", "这壶龙井，是今年明前的新茶"]},
    {"id": "postal_worker", "name": "乡邮员", "file": "postal_worker.png", "voice": "echo", "gender": "male",
     "category": "劳动者", "desc": "45 岁大山信使", "samples": ["这条山路我走了二十年，每一家都认识", "再远的地方，信也能送到"]},
    {"id": "welder_woman", "name": "女焊工", "file": "welder_woman.png", "voice": "nova", "gender": "female",
     "category": "劳动者", "desc": "35 岁钢铁玫瑰", "samples": ["焊缝要均匀，就像做人要踏实", "谁说女人不能做这行？"]},
    {"id": "blind_musician", "name": "盲人琴师", "file": "blind_musician.png", "voice": "onyx", "gender": "male",
     "category": "文化艺术", "desc": "62 岁二胡演奏家", "samples": ["音乐是光，即使看不见也能感受到", "这首二泉映月，送给所有在黑暗中坚持的人"]},
    {"id": "migrant_mom", "name": "打工妈妈", "file": "migrant_mom.png", "voice": "nova", "gender": "female",
     "category": "生活", "desc": "35 岁远方的牵挂", "samples": ["孩子，妈妈在外面一切都好", "等攒够了钱，就回家陪你"]},
    {"id": "game_developer", "name": "游戏开发者", "file": "game_developer.png", "voice": "echo", "gender": "male",
     "category": "商务科技", "desc": "26 岁独立开发者", "samples": ["这个游戏的灵感来自我的童年", "做游戏最重要的是好玩"]},
    {"id": "librarian", "name": "图书管理员", "file": "librarian.png", "voice": "nova", "gender": "female",
     "category": "教育", "desc": "52 岁知识守门人", "samples": ["这本书我推荐了三十年", "图书馆是最公平的地方，人人都能来"]},
    {"id": "fisherman", "name": "老渔民", "file": "fisherman.png", "voice": "onyx", "gender": "male",
     "category": "劳动者", "desc": "55 岁海上老人（全身）", "samples": ["大海教会我的，比学校多得多", "今天浪不大，出海正好"]},
    {"id": "ballet_dancer", "name": "芭蕾舞者", "file": "ballet_dancer.png", "voice": "shimmer", "gender": "female",
     "category": "文化艺术", "desc": "23 岁翩翩起舞（半身）", "samples": ["每一次旋转都是和自己的对话", "台上一分钟，台下十年功"]},
    {"id": "construction_worker", "name": "建筑工人", "file": "construction_worker.png", "voice": "echo", "gender": "male",
     "category": "劳动者", "desc": "35 岁城市建造者", "samples": ["这栋楼是我们一砖一瓦盖起来的", "虽然辛苦，但看到高楼拔地而起很自豪"]},
    {"id": "flower_shop_owner", "name": "花店老板娘", "file": "flower_shop_owner.png", "voice": "nova", "gender": "female",
     "category": "生活", "desc": "40 岁用花传情（半身）", "samples": ["每束花都有它的语言", "今天这束向日葵，送给需要阳光的人"]},
]

VOICE_LABELS = {
    "onyx": "Onyx（沉稳男声）", "echo": "Echo（年轻男声）",
    "fable": "Fable（叙事男声）", "alloy": "Alloy（中性声）",
    "nova": "Nova（温暖女声）", "shimmer": "Shimmer（清澈女声）",
}

app = FastAPI(title="数字人直播系统")

# Global connection-pooled HTTP clients (created at startup, closed at shutdown)
dh_client: httpx.AsyncClient = None  # type: ignore[assignment]
tts_client: httpx.AsyncClient = None  # type: ignore[assignment]


@app.on_event("startup")
async def _startup():
    global dh_client, tts_client
    dh_client = httpx.AsyncClient(timeout=httpx.Timeout(300.0))
    tts_client = httpx.AsyncClient(timeout=60.0)


@app.on_event("shutdown")
async def _shutdown():
    await dh_client.aclose()
    await tts_client.aclose()


def _load_meta() -> dict:
    if META_FILE.exists():
        return json.loads(META_FILE.read_text())
    return {}

def _save_meta(meta: dict):
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2))

def _find_preset(avatar_id):
    for p in PRESETS:
        if p["id"] == avatar_id:
            return p
    return None


@app.get("/api/voices")
async def list_voices():
    return [{"id": k, "label": v} for k, v in VOICE_LABELS.items()]

@app.get("/api/categories")
async def list_categories():
    return CATEGORIES

@app.get("/api/avatars")
async def list_avatars():
    result = []
    for p in PRESETS:
        result.append({
            "id": p["id"], "name": p["name"], "preset": True,
            "voice": p["voice"], "gender": p["gender"],
            "category": p.get("category", ""),
            "desc": p.get("desc", ""), "samples": p.get("samples", []),
        })
    for aid, info in _load_meta().items():
        result.append({
            "id": aid, "name": info["name"], "preset": False,
            "voice": info.get("voice", "nova"), "gender": info.get("gender", "unknown"),
            "category": "", "desc": "", "samples": [],
        })
    return result

_CDN_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400"}


@app.get("/api/avatars/{avatar_id}/image")
async def get_avatar_image(avatar_id: str):
    p = _find_preset(avatar_id)
    if p:
        path = AVATARS_DIR / p["file"]
        if path.exists():
            return FileResponse(path, media_type="image/png", headers=_CDN_CACHE_HEADERS)
    meta = _load_meta()
    if avatar_id in meta:
        path = UPLOADS_DIR / meta[avatar_id]["file"]
        if path.exists():
            return FileResponse(path, headers=_CDN_CACHE_HEADERS)
    raise HTTPException(404, "角色不存在")


def _make_thumbnail(source_path: Path, avatar_id: str) -> Path:
    """Create a 128x128 WebP thumbnail, cached in THUMBNAILS_DIR."""
    thumb_path = THUMBNAILS_DIR / f"{avatar_id}.webp"
    if thumb_path.exists() and thumb_path.stat().st_mtime >= source_path.stat().st_mtime:
        return thumb_path
    with Image.open(source_path) as img:
        img = img.convert("RGB")
        img.thumbnail((128, 128), Image.LANCZOS)
        img.save(thumb_path, "WEBP", quality=80)
    return thumb_path


@app.get("/api/avatars/{avatar_id}/thumbnail")
async def get_avatar_thumbnail(avatar_id: str):
    source_path = None
    p = _find_preset(avatar_id)
    if p:
        source_path = AVATARS_DIR / p["file"]
    else:
        meta = _load_meta()
        if avatar_id in meta:
            source_path = UPLOADS_DIR / meta[avatar_id]["file"]
    if not source_path or not source_path.exists():
        raise HTTPException(404, "角色不存在")
    thumb_path = _make_thumbnail(source_path, avatar_id)
    return FileResponse(thumb_path, media_type="image/webp", headers=_CDN_CACHE_HEADERS)


@app.post("/api/avatars/upload")
async def upload_avatar(
    name: str = Form(...), image: UploadFile = File(...),
    voice: str = Form("nova"), gender: str = Form("unknown"),
):
    avatar_id = uuid.uuid4().hex[:8]
    ext = Path(image.filename).suffix or ".png"
    filename = f"{avatar_id}{ext}"
    path = UPLOADS_DIR / filename
    path.write_bytes(await image.read())
    meta = _load_meta()
    meta[avatar_id] = {"name": name, "file": filename, "voice": voice, "gender": gender}
    _save_meta(meta)
    return {"id": avatar_id, "name": name}

@app.delete("/api/avatars/{avatar_id}")
async def delete_avatar(avatar_id: str):
    if _find_preset(avatar_id):
        raise HTTPException(400, "不能删除预设角色")
    meta = _load_meta()
    if avatar_id not in meta:
        raise HTTPException(404, "角色不存在")
    path = UPLOADS_DIR / meta[avatar_id]["file"]
    if path.exists():
        path.unlink()
    del meta[avatar_id]
    _save_meta(meta)
    return {"ok": True}


async def _openai_tts(text: str, voice: str) -> bytes:
    resp = await tts_client.post(
        OPENAI_TTS_URL,
        headers={"Authorization": f"Bearer {OPENAI_KEY}"},
        json={"model": "tts-1-hd", "input": text, "voice": voice},
    )
    if resp.status_code != 200:
        raise HTTPException(502, f"TTS错误: {resp.text}")
    return resp.content


@app.post("/api/chat")
async def chat_proxy(message: str = Form(...)):
    resp = await dh_client.post(
        f"{DH_API}/api/chat", data={"message": message, "model": "qwen3.6:27b"},
    )
    if resp.status_code != 200:
        raise HTTPException(502, f"LLM错误: {resp.text}")
    return resp.json()


async def _transcode_h264(raw_video: bytes) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as src, \
         tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as dst:
        src.write(raw_video)
        src_path, dst_path = Path(src.name), Path(dst.name)
    try:
        proc = await asyncio.create_subprocess_exec(
            FFMPEG, "-y", "-i", str(src_path),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-movflags", "+faststart",
            str(dst_path),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        return dst_path.read_bytes() if proc.returncode == 0 else raw_video
    finally:
        src_path.unlink(missing_ok=True)
        dst_path.unlink(missing_ok=True)


@app.post("/api/generate")
async def generate(
    text: str = Form(...), avatar_id: str = Form(...),
    engine: str = Form("sadtalker"),
):
    image_path, voice = None, "nova"
    p = _find_preset(avatar_id)
    if p:
        image_path = AVATARS_DIR / p["file"]
        voice = p["voice"]
    else:
        meta = _load_meta()
        if avatar_id in meta:
            image_path = UPLOADS_DIR / meta[avatar_id]["file"]
            voice = meta[avatar_id].get("voice", "nova")
    if not image_path or not image_path.exists():
        raise HTTPException(404, "角色不存在")

    audio_bytes = await _openai_tts(text, voice)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as af:
        af.write(audio_bytes)
        audio_path = Path(af.name)
    try:
        with open(image_path, "rb") as img_f, open(audio_path, "rb") as aud_f:
            resp = await dh_client.post(
                f"{DH_API}/api/generate",
                files={
                    "image": (image_path.name, img_f, "image/png"),
                    "audio": ("speech.mp3", aud_f, "audio/mpeg"),
                },
                data={"engine": engine},
            )
    finally:
        audio_path.unlink(missing_ok=True)
    if resp.status_code != 200:
        raise HTTPException(502, f"数字人API错误: {resp.text}")
    video_bytes = await _transcode_h264(resp.content)
    return Response(content=video_bytes, media_type="video/mp4")


@app.post("/api/ai-talk")
async def ai_talk(
    message: str = Form(...), avatar_id: str = Form(...),
    engine: str = Form("sadtalker"),
):
    image_path, voice = None, "nova"
    p = _find_preset(avatar_id)
    if p:
        image_path = AVATARS_DIR / p["file"]
        voice = p["voice"]
    else:
        meta = _load_meta()
        if avatar_id in meta:
            image_path = UPLOADS_DIR / meta[avatar_id]["file"]
            voice = meta[avatar_id].get("voice", "nova")
    if not image_path or not image_path.exists():
        raise HTTPException(404, "角色不存在")

    llm_resp = await dh_client.post(
        f"{DH_API}/api/chat", data={"message": message, "model": "qwen3.6:27b"},
    )
    if llm_resp.status_code != 200:
        raise HTTPException(502, f"LLM错误: {llm_resp.text}")

    llm_data = llm_resp.json()
    msg = llm_data.get("message", {})
    llm_text = msg.get("content", "") if isinstance(msg, dict) else str(msg)
    if not llm_text:
        llm_text = llm_data.get("response", str(llm_data))
    if len(llm_text) > 300:
        llm_text = llm_text[:300] + "……"

    audio_bytes = await _openai_tts(llm_text, voice)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as af:
        af.write(audio_bytes)
        audio_path = Path(af.name)
    try:
        with open(image_path, "rb") as img_f, open(audio_path, "rb") as aud_f:
            resp = await dh_client.post(
                f"{DH_API}/api/generate",
                files={
                    "image": (image_path.name, img_f, "image/png"),
                    "audio": ("speech.mp3", aud_f, "audio/mpeg"),
                },
                data={"engine": engine},
            )
    finally:
        audio_path.unlink(missing_ok=True)
    if resp.status_code != 200:
        raise HTTPException(502, f"数字人API错误: {resp.text}")

    video_bytes = await _transcode_h264(resp.content)
    return Response(
        content=video_bytes, media_type="video/mp4",
        headers={"X-LLM-Response": llm_text},
    )


@app.get("/api/services")
async def services_proxy():
    try:
        resp = await dh_client.get(f"{DH_API}/api/services")
        return resp.json()
    except Exception:
        return {"error": "API unreachable"}

@app.get("/api/health")
async def health():
    try:
        resp = await dh_client.get(f"{DH_API}/health")
        dh_status = resp.json()
    except Exception:
        dh_status = {"status": "unreachable"}
    return {"status": "ok", "digital_human_api": dh_status}


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.endswith((".html", ".js", ".css")) or request.url.path == "/":
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response

app.add_middleware(NoCacheStaticMiddleware)
app.mount("/", StaticFiles(directory=str(BASE / "static"), html=True))
