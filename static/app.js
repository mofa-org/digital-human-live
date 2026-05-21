const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let selectedAvatar = null;
let avatarData = {};
let allAvatars = [];
let generating = false;
let currentMode = "direct";
let currentEngine = "sadtalker";
let currentCategory = null;
let currentVideoUrl = null;
let voiceLabels = {};

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

async function loadVoices() {
    try {
        const r = await fetch("/api/voices");
        if (r.ok) (await r.json()).forEach((v) => { voiceLabels[v.id] = v.label; });
    } catch {}
}

async function loadCategories() {
    try {
        const r = await fetch("/api/categories");
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
        card.innerHTML = `
            <img src="/api/avatars/${a.id}/image" alt="${a.name}" loading="lazy">
            <span class="avatar-name">${a.name}</span>
        `;
        card.addEventListener("click", () => {
            selectedAvatar = a.id;
            $$(".avatar-card").forEach((c) => c.classList.remove("active"));
            card.classList.add("active");
            showSamples(a);
            updateUI();
        });
        list.appendChild(card);
    });
}

async function loadAvatars() {
    try {
        const r = await fetch("/api/avatars");
        if (!r.ok) return;
        allAvatars = await r.json();
        allAvatars.forEach((a) => { avatarData[a.id] = a; });
        renderAvatars();
    } catch (e) {
        console.error("loadAvatars:", e);
    }
}

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
            updateUI();
            $("#text-input").focus();
        });
        list.appendChild(chip);
    });
    panel.classList.remove("hidden");
}

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

async function generate() {
    if (!selectedAvatar || generating) return;
    const text = $("#text-input").value.trim();
    if (!text) return;

    generating = true;
    updateUI();

    const loading = $("#loading");
    const loadingText = $("#loading-text");
    const placeholder = $("#placeholder");
    const video = $("#video-player");
    const llmBox = $("#llm-box");
    const timeBadge = $("#time-badge");

    loading.classList.remove("hidden");
    placeholder.classList.add("hidden");
    llmBox.classList.add("hidden");
    timeBadge.classList.add("hidden");
    $("#download-btn").classList.add("hidden");

    const t0 = Date.now();
    const timer = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        loadingText.textContent = (currentMode === "ai" ? "AI 思考 + 生成 " : "生成中 ") + s + "s";
    }, 1000);

    try {
        let spokenText = text;

        if (currentMode === "ai") {
            loadingText.textContent = "AI 思考中...";
            const chatForm = new FormData();
            chatForm.append("message", text);
            const chatResp = await fetch("/api/chat", { method: "POST", body: chatForm });
            if (!chatResp.ok) throw new Error("AI 服务暂时不可用，请稍后重试");
            const chatData = await chatResp.json();
            const msg = chatData.message;
            spokenText = (typeof msg === "object" ? msg.content : msg) || chatData.response || "";
            if (!spokenText.trim()) throw new Error("AI 未返回有效回复，请换个问题试试");
            if (spokenText.length > 300) spokenText = spokenText.slice(0, 300) + "...";
            llmBox.textContent = spokenText;
            llmBox.classList.remove("hidden");
            loadingText.textContent = "生成数字人视频...";
        }

        const form = new FormData();
        form.append("avatar_id", selectedAvatar);
        form.append("engine", currentEngine);
        form.append("text", spokenText);

        const resp = await fetch("/api/generate", { method: "POST", body: form });
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
        video.play().catch(() => {});

        timeBadge.textContent = elapsed + "s";
        timeBadge.classList.remove("hidden");
        $("#download-btn").classList.remove("hidden");

        $("#text-input").value = "";
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

// Tabs
$$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
        $$(".tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.dataset.mode;
        const input = $("#text-input");
        input.placeholder = currentMode === "ai"
            ? "问个问题，数字人会替你回答..."
            : "输入要说的话...（Enter 发送）";
        $("#llm-box").classList.add("hidden");
        updateUI();
    });
});

// Engine
$$(".engine-option").forEach((opt) => {
    opt.addEventListener("click", () => {
        $$(".engine-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        currentEngine = opt.dataset.engine;
    });
});

// Upload
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

// Textarea auto-resize
const ta = $("#text-input");
ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
    updateUI();
});
ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!$("#send-btn").disabled) generate();
    }
});
$("#send-btn").addEventListener("click", generate);

// Download button
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

// Hamburger menu (mobile)
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

    // Close sidebar when avatar is selected (mobile convenience)
    document.addEventListener("click", (e) => {
        if (e.target.closest(".avatar-card") && window.innerWidth < 768) {
            setTimeout(closeSidebar, 150);
        }
    });
})();

// Init
(async () => {
    await loadVoices();
    await loadCategories();
    await loadAvatars();
    checkHealth();
    updateUI();
    setInterval(checkHealth, 30000);
})();
