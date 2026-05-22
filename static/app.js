const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/**
 * Fetch with one automatic retry on network errors (not HTTP errors).
 * Shows a toast during the retry wait.
 */
async function fetchWithRetry(url, options = {}) {
    try {
        return await fetch(url, options);
    } catch (err) {
        if (err instanceof TypeError) {
            toast("网络波动，正在重试...", 2500);
            await new Promise((r) => setTimeout(r, 2000));
            return await fetch(url, options);
        }
        throw err;
    }
}

let selectedAvatar = null;
let avatarData = {};
let allAvatars = [];
let generating = false;
let currentMode = "direct";
let currentEngine = "sadtalker";
let currentCategory = null;
let currentVideoUrl = null;
let videoHistory = [];
const MAX_HISTORY = 5;
let voiceLabels = {};
let hasGeneratedVideo = false;

/* ── Scene template configs ── */
const SCENE_CONFIGS = {
    news:   { avatarId: "news_anchor",       text: "观众朋友们好，欢迎收看今天的新闻播报", mode: "direct" },
    teach:  { avatarId: "retired_professor",  text: "让我们来了解一下中国古代四大发明",      mode: "direct" },
    health: { avatarId: "doctor_li",          text: "今天给大家讲讲预防感冒的小知识",        mode: "direct" },
    story:  { avatarId: "grandma_chen",       text: "孩子们，奶奶给你们讲一个很久以前的故事", mode: "direct" },
    cook:   { avatarId: "chef_wang",          text: "今天教大家做一道家常红烧肉",            mode: "direct" },
    ai:     { avatarId: "tech_engineer",      text: "用简单的话解释什么是人工智能",          mode: "ai" },
};

/* ── Toast ── */
function toast(msg, ms = 3000) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.classList.add("hidden"), 300);
    }, ms);
}

/* ── Load voices ── */
async function loadVoices() {
    try {
        const r = await fetch("/api/voices");
        if (r.ok) (await r.json()).forEach((v) => { voiceLabels[v.id] = v.label; });
    } catch {}
}

/* ── Load categories ── */
async function loadCategories() {
    try {
        const r = await fetchWithRetry("/api/categories");
        if (!r.ok) return;
        const cats = await r.json();
        const container = $("#category-filter");
        if (!container) return;
        container.innerHTML = "";

        const allChip = document.createElement("button");
        allChip.className = "category-chip active";
        allChip.textContent = "全部";
        allChip.addEventListener("click", () => {
            currentCategory = null;
            $$(".category-chip").forEach((c) => c.classList.remove("active"));
            allChip.classList.add("active");
            renderAvatars();
        });
        container.appendChild(allChip);

        cats.forEach((cat) => {
            const chip = document.createElement("button");
            chip.className = "category-chip";
            chip.textContent = cat;
            chip.addEventListener("click", () => {
                currentCategory = cat;
                $$(".category-chip").forEach((c) => c.classList.remove("active"));
                chip.classList.add("active");
                renderAvatars();
            });
            container.appendChild(chip);
        });
    } catch (e) {
        console.error("loadCategories:", e);
    }
}

/* ── Render avatars (3-col grid with tags) ── */
function renderAvatars() {
    const list = $("#avatar-list");
    list.innerHTML = "";
    const filtered = currentCategory
        ? allAvatars.filter((a) => a.category === currentCategory)
        : allAvatars;
    filtered.forEach((a) => {
        const card = document.createElement("div");
        card.className = "avatar-card" + (selectedAvatar === a.id ? " active" : "");
        card.title = a.desc || a.name;
        const tagHtml = a.category ? `<span class="avatar-tag">${a.category}</span>` : "";
        card.innerHTML = `
            <img src="/api/avatars/${a.id}/thumbnail" alt="${a.name}" loading="lazy">
            <span class="avatar-name">${a.name}</span>
            ${tagHtml}
        `;
        card.addEventListener("click", () => selectAvatar(a.id));
        list.appendChild(card);
    });
}

/* ── Select avatar (shared logic) ── */
function selectAvatar(avatarId) {
    selectedAvatar = avatarId;
    $$(".avatar-card").forEach((c) => c.classList.remove("active"));
    // Find and activate the matching card
    const cards = $$(".avatar-card");
    const filtered = currentCategory
        ? allAvatars.filter((a) => a.category === currentCategory)
        : allAvatars;
    filtered.forEach((a, i) => {
        if (a.id === avatarId && cards[i]) cards[i].classList.add("active");
    });

    const a = avatarData[avatarId];
    if (a) {
        showAvatarInfo(a);
        showSamples(a);
    }
    updateUI();
}

/* ── Avatar info banner ── */
function showAvatarInfo(a) {
    const info = $("#avatar-info");
    if (!info) return;
    $("#info-avatar-img").src = `/api/avatars/${a.id}/image`;
    $("#info-avatar-name").textContent = a.name;
    $("#info-avatar-desc").textContent = a.desc || "";
    $("#info-avatar-voice").textContent = voiceLabels[a.voice] || a.voice;
    info.classList.remove("hidden");
}

/* ── Load avatars ── */
async function loadAvatars() {
    try {
        const r = await fetchWithRetry("/api/avatars");
        if (!r.ok) return;
        allAvatars = await r.json();
        allAvatars.forEach((a) => { avatarData[a.id] = a; });
        renderAvatars();
    } catch (e) {
        console.error("loadAvatars:", e);
    }
}

/* ── Samples ── */
function showSamples(a) {
    const panel = $("#samples");
    const label = $("#samples-label");
    const list = $("#samples-list");

    if (!a.samples || a.samples.length === 0) {
        panel.classList.add("hidden");
        return;
    }

    label.textContent = a.name + (a.desc ? " \u00b7 " + a.desc : "");
    list.innerHTML = "";
    a.samples.forEach((s) => {
        const chip = document.createElement("button");
        chip.className = "sample-chip";
        chip.textContent = s;
        chip.addEventListener("click", () => {
            $("#text-input").value = s;
            updateCharCount();
            updateUI();
            $("#text-input").focus();
        });
        list.appendChild(chip);
    });
    panel.classList.remove("hidden");
}

/* ── Character counter ── */
function updateCharCount() {
    const ta = $("#text-input");
    const counter = $("#char-count");
    const len = ta.value.length;
    counter.textContent = `${len}/300`;
    counter.classList.remove("warn", "error");
    if (len >= 300) {
        counter.classList.add("error");
    } else if (len >= 250) {
        counter.classList.add("warn");
    }
}

/* ── Update UI state ── */
function updateUI() {
    const text = $("#text-input").value.trim();
    const btn = $("#send-btn");
    if (generating) {
        btn.disabled = true;
        btn.textContent = "生成中...";
    } else if (!selectedAvatar) {
        btn.disabled = true;
        btn.textContent = "请先选角色";
    } else if (!text) {
        btn.disabled = true;
        btn.textContent = currentMode === "ai" ? "请输入问题" : "请输入文字";
    } else {
        btn.disabled = false;
        btn.textContent = currentMode === "ai" ? "提问" : "生成";
    }
}

/* ── Step progress helper ── */
function setStep(stepIndex) {
    // Steps: 0=AI thinking (optional), 1=TTS, 2=Video, 3=Transcode (not always shown)
    // We use 3 dots: dot-0, dot-1, dot-2 and 2 lines: line-0, line-1
    for (let i = 0; i < 3; i++) {
        const dot = $(`#step-dot-${i}`);
        const line = i < 2 ? $(`#step-line-${i}`) : null;
        dot.classList.remove("active", "done");
        if (line) line.classList.remove("done");

        if (i < stepIndex) {
            dot.classList.add("done");
            if (line) line.classList.add("done");
        } else if (i === stepIndex) {
            dot.classList.add("active");
        }
    }
}

/* ── Generate ── */
async function generate() {
    if (!selectedAvatar || generating) return;
    const text = $("#text-input").value.trim();
    if (!text) return;

    generating = true;
    updateUI();

    const loading = $("#loading");
    const loadingText = $("#loading-text");
    const loadingTimer = $("#loading-timer");
    const placeholder = $("#placeholder");
    const video = $("#video-player");
    const videoWrap = $("#video-wrap");
    const llmBox = $("#llm-box");
    const timeBadge = $("#time-badge");

    loading.classList.remove("hidden");
    placeholder.classList.add("hidden");
    llmBox.classList.add("hidden");
    timeBadge.classList.add("hidden");
    $("#download-btn").classList.add("hidden");

    // Reset steps
    setStep(0);

    const t0 = Date.now();
    const timer = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        loadingTimer.textContent = s + "s";
    }, 1000);

    let spokenText = text;

    try {
        if (currentMode === "ai") {
            // Step 0: AI thinking
            loadingText.textContent = "AI 思考中...";
            setStep(0);
            const chatForm = new FormData();
            chatForm.append("message", text);
            const chatResp = await fetchWithRetry("/api/chat", { method: "POST", body: chatForm });
            if (!chatResp.ok) throw new Error("AI 服务暂时不可用，请稍后重试");
            const chatData = await chatResp.json();
            const msg = chatData.message;
            spokenText = (typeof msg === "object" ? msg.content : msg) || chatData.response || "";
            if (!spokenText.trim()) throw new Error("AI 未返回有效回复，请换个问题试试");
            if (spokenText.length > 300) spokenText = spokenText.slice(0, 300) + "...";
            llmBox.textContent = spokenText;
            llmBox.classList.remove("hidden");
        }

        // Step 1: TTS
        loadingText.textContent = "语音合成中...";
        setStep(1);

        // Small delay to show step transition visually
        await new Promise((r) => setTimeout(r, 300));

        // Step 2: Video generation (TTS + video happen server-side together)
        loadingText.textContent = "视频生成中...";
        setStep(2);

        const form = new FormData();
        form.append("avatar_id", selectedAvatar);
        form.append("engine", currentEngine);
        form.append("text", spokenText);
        const resp = await fetchWithRetry("/api/generate", { method: "POST", body: form });

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        if (!resp.ok) {
            let msg = "视频生成失败";
            try { msg = (await resp.json()).detail || msg; } catch {}
            throw new Error(msg);
        }

        const blob = await resp.blob();
        if (blob.size < 500) throw new Error("生成的视频无效，请重试");

        const url = URL.createObjectURL(blob);
        if (video.src && video.src.startsWith("blob:")) URL.revokeObjectURL(video.src);

        currentVideoUrl = url;
        video.src = url;
        video.classList.add("visible");
        videoWrap.classList.add("playing");
        video.play().catch(() => {});

        hasGeneratedVideo = true;

        timeBadge.textContent = elapsed + "s";
        timeBadge.classList.remove("hidden");
        $("#download-btn").classList.remove("hidden");

        addToHistory(url, avatarData[selectedAvatar]?.name || selectedAvatar, spokenText);

        $("#text-input").value = "";
        updateCharCount();
        toast("生成完成 " + elapsed + "s");
    } catch (e) {
        toast(e.message, 4000);
        if (!video.classList.contains("visible")) placeholder.classList.remove("hidden");
    } finally {
        clearInterval(timer);
        loading.classList.add("hidden");
        generating = false;
        updateUI();
    }
}

/* ── Health check ── */
async function checkHealth() {
    try {
        const r = await fetch("/api/health");
        if (!r.ok) throw new Error();
        const d = await r.json();
        const dh = d.digital_human_api;
        const dot = $("#api-status");
        const txt = $("#api-status-text");
        if (dh?.status === "ok") {
            dot.className = "dot on";
            txt.textContent = "GPU 在线 " + (dh.vram_total || "");
        } else {
            dot.className = "dot off";
            txt.textContent = "API 离线";
        }
    } catch {
        $("#api-status").className = "dot off";
        $("#api-status-text").textContent = "连接失败";
    }
}

/* ── Tabs ── */
$$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
        $$(".tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.dataset.mode;
        const input = $("#text-input");
        const placeholders = {
            direct: "输入要说的话...（Enter 发送）",
            ai: "问个问题，数字人会替你回答...",
        };
        input.placeholder = placeholders[currentMode] || placeholders.direct;
        $("#llm-box").classList.add("hidden");
        updateUI();
    });
});

/* ── Engine ── */
$$(".engine-option").forEach((opt) => {
    opt.addEventListener("click", () => {
        $$(".engine-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        currentEngine = opt.dataset.engine;
    });
});

/* ── Upload ── */
$("#upload-btn").addEventListener("click", () => $("#upload-input").click());
$("#upload-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const name = prompt("给这个角色起个名字：");
    if (!name || !name.trim()) { e.target.value = ""; return; }
    const gender = prompt("角色性别？输入 male 或 female：", "female");
    const form = new FormData();
    form.append("name", name.trim());
    form.append("image", file);
    form.append("voice", gender === "male" ? "onyx" : "nova");
    form.append("gender", gender || "female");
    try {
        const resp = await fetch("/api/avatars/upload", { method: "POST", body: form });
        if (resp.ok) {
            const data = await resp.json();
            selectedAvatar = data.id;
            await loadAvatars();
            updateUI();
            toast("角色已添加");
        } else {
            toast("上传失败，请重试");
        }
    } catch {
        toast("网络错误");
    }
    e.target.value = "";
});

/* ── Textarea auto-resize + char count ── */
const ta = $("#text-input");
ta.addEventListener("input", () => {
    // Enforce 500 char hard limit
    if (ta.value.length > 500) {
        ta.value = ta.value.slice(0, 500);
    }
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
    updateCharCount();
    updateUI();
});
ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!$("#send-btn").disabled) generate();
    }
});
$("#send-btn").addEventListener("click", generate);

/* ── Voice preview (in avatar info banner) ── */
let previewAudio = null;
const infoPreviewBtn = $("#info-preview-btn");
if (infoPreviewBtn) {
    infoPreviewBtn.addEventListener("click", async () => {
        if (!selectedAvatar || infoPreviewBtn.classList.contains("playing")) return;
        const avatar = avatarData[selectedAvatar];
        if (!avatar) return;
        infoPreviewBtn.classList.add("playing");
        infoPreviewBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg> 播放中`;
        try {
            const form = new FormData();
            form.append("voice", avatar.voice);
            const resp = await fetch("/api/tts-preview", { method: "POST", body: form });
            if (!resp.ok) throw new Error("试听失败");
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            if (previewAudio) { previewAudio.pause(); URL.revokeObjectURL(previewAudio.src); }
            previewAudio = new Audio(url);
            previewAudio.onended = () => {
                infoPreviewBtn.classList.remove("playing");
                infoPreviewBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 试听`;
            };
            previewAudio.play().catch(() => {});
        } catch {
            toast("试听失败，请重试");
        } finally {
            if (!previewAudio || previewAudio.paused) {
                infoPreviewBtn.classList.remove("playing");
                infoPreviewBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 试听`;
            }
        }
    });
}

/* ── Scene templates ── */
$$(".scene-card").forEach((card) => {
    card.addEventListener("click", () => {
        const sceneKey = card.dataset.scene;
        const cfg = SCENE_CONFIGS[sceneKey];
        if (!cfg) return;

        // Switch mode if needed
        if (cfg.mode !== currentMode) {
            currentMode = cfg.mode;
            $$(".tab").forEach((b) => {
                b.classList.remove("active");
                if (b.dataset.mode === cfg.mode) b.classList.add("active");
            });
            const placeholders = {
                direct: "输入要说的话...（Enter 发送）",
                ai: "问个问题，数字人会替你回答...",
            };
            $("#text-input").placeholder = placeholders[cfg.mode] || placeholders.direct;
        }

        // Select avatar
        selectAvatar(cfg.avatarId);

        // Fill text
        $("#text-input").value = cfg.text;
        updateCharCount();
        updateUI();
        $("#text-input").focus();

        toast(`已选择「${card.querySelector(".scene-title").textContent}」场景，点击生成即可`);

        // On mobile, close sidebar if open
        if (window.innerWidth < 768) {
            const sidebar = $("#sidebar");
            const overlay = $("#sidebar-overlay");
            sidebar.classList.remove("open");
            overlay.classList.remove("open");
        }
    });
});

/* ── Video playback state tracking ── */
const videoEl = $("#video-player");
if (videoEl) {
    videoEl.addEventListener("playing", () => {
        $("#video-wrap").classList.add("playing");
    });
    videoEl.addEventListener("pause", () => {
        $("#video-wrap").classList.remove("playing");
    });
    videoEl.addEventListener("ended", () => {
        $("#video-wrap").classList.remove("playing");
    });
}

/* ── History management ── */
function addToHistory(url, characterName, text) {
    videoHistory.unshift({
        url,
        characterName,
        text: text.length > 30 ? text.slice(0, 30) + "..." : text,
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    });
    if (videoHistory.length > MAX_HISTORY) {
        const removed = videoHistory.pop();
        URL.revokeObjectURL(removed.url);
    }
    renderHistory();
}

function renderHistory() {
    const panel = $("#history-panel");
    const list = $("#history-list");
    if (!panel || !list) return;
    if (videoHistory.length === 0) {
        panel.classList.add("hidden");
        return;
    }
    panel.classList.remove("hidden");
    list.innerHTML = "";
    videoHistory.forEach((item) => {
        const el = document.createElement("div");
        el.className = "history-item" + (item.url === currentVideoUrl ? " active" : "");
        el.innerHTML = `
            <video src="${item.url}" muted preload="metadata"></video>
            <div class="history-meta">${item.characterName} ${item.timestamp}</div>
        `;
        el.addEventListener("click", () => {
            const video = $("#video-player");
            const placeholder = $("#placeholder");
            currentVideoUrl = item.url;
            video.src = item.url;
            video.classList.add("visible");
            placeholder.classList.add("hidden");
            video.play().catch(() => {});
            $("#download-btn").classList.remove("hidden");
            $$(".history-item").forEach((h) => h.classList.remove("active"));
            el.classList.add("active");
        });
        list.appendChild(el);
    });
}

/* ── Download button ── */
$("#download-btn").addEventListener("click", () => {
    if (!currentVideoUrl) return;
    const a = document.createElement("a");
    a.href = currentVideoUrl;
    const name = avatarData[selectedAvatar]?.name || "digital-human";
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    a.download = name + "_" + ts + ".mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

/* ── Hamburger menu (mobile) ── */
(() => {
    const hamburger = $("#hamburger");
    const sidebar = $("#sidebar");
    const overlay = $("#sidebar-overlay");
    if (!hamburger || !sidebar) return;

    function openSidebar() {
        sidebar.classList.add("open");
        overlay.classList.add("open");
    }
    function closeSidebar() {
        sidebar.classList.remove("open");
        overlay.classList.remove("open");
    }

    hamburger.addEventListener("click", () => {
        sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });
    overlay.addEventListener("click", closeSidebar);

    document.addEventListener("click", (e) => {
        if (e.target.closest(".avatar-card") && window.innerWidth < 768) {
            setTimeout(closeSidebar, 150);
        }
    });
})();

/* ── Init ── */
(async () => {
    await loadVoices();
    await loadCategories();
    await loadAvatars();
    checkHealth();
    updateCharCount();
    updateUI();
    setInterval(checkHealth, 30000);
})();
