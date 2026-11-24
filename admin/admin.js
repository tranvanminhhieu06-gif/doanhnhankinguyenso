/* Trang quản trị Doanh Nhân Kỷ Nguyên Số
 * - Chạy trên máy (localhost): đọc/ghi thẳng vào file qua serve.ps1.
 * - Chạy trên mạng (GitHub Pages): đọc/ghi data/content.json trong repo qua GitHub API,
 *   GitHub Pages tự cập nhật web sau 1–2 phút.
 */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DATA_PATH = "data/content.json";
  const UPLOAD_DIR = "images/uploads";
  // ?online: khi chạy trên máy, giả lập bản online để thử màn hình đăng nhập
  const IS_LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && !new URLSearchParams(location.search).has("online");
  const CONN_KEY = "dnkns-admin-conn";

  // Repo mặc định: đoán từ địa chỉ *.github.io/<repo>/admin/, nếu không thì dùng repo hiện tại
  const guessRepo = () => {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    const seg = location.pathname.split("/").filter(Boolean)[0];
    if (m) return { owner: m[1], repo: seg && seg !== "admin" ? seg : `${m[1]}.github.io`, branch: "main" };
    return { owner: "tranvanminhhieu06-gif", repo: "doanhnhankinguyenso", branch: "main" };
  };

  /* ================= Trạng thái ================= */
  let conn = null;          // { owner, repo, branch, token }
  let data = null;          // bản đang sửa
  let savedJSON = "";       // bản đã xuất bản (để biết có thay đổi chưa)
  let sha = null;           // phiên bản file trên GitHub
  let changes = [];         // nhật ký thay đổi chưa xuất bản (dùng làm nội dung commit)
  const previews = {};      // ảnh vừa tải lên → URL xem trước (vì GitHub Pages chưa kịp cập nhật)

  const isDirty = () => data && JSON.stringify(data) !== savedJSON;
  const note = (msg) => { changes.push(msg); refreshDirty(); };

  /* ================= Tiện ích ================= */
  // Bỏ dấu tiếng Việt, chữ thường: "Khởi Nghiệp" → "khoi nghiep" (dùng cho tìm kiếm)
  const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const slugify = (s) => norm(s).replace(/ /g, "-").slice(0, 80).replace(/-+$/, "") || "bai-viet";
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmtDate = (s) => { const [y, m, d] = String(s || "").split("-"); return d ? `${d}/${m}/${y}` : esc(s); };
  const imgSrc = (p) => (!p ? "" : previews[p] || (/^(https?:|data:|blob:)/.test(p) ? p : "../" + p));
  const catName = (slug) => (data.categories.find((c) => c.slug === slug) || {}).name || slug;
  const plain = (md) => String(md || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`-]+/g, " ").replace(/\s+/g, " ").trim();
  const makeExcerpt = (md) => { const t = plain(md); return t.length > 170 ? t.slice(0, 170).replace(/\s+\S*$/, "") + "…" : t; };

  function toast(msg, type = "ok", ms = 4000) {
    const icon = { ok: "fa-circle-check", err: "fa-circle-exclamation", info: "fa-circle-info" }[type];
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  // Hộp xác nhận: trả về true nếu người dùng đồng ý
  function confirmBox({ title, text, ok, cancel = "Giữ lại" }) {
    return new Promise((resolve) => {
      $("#modalTitle").textContent = title;
      $("#modalText").textContent = text;
      $("#modalOk").textContent = ok;
      $("#modalCancel").textContent = cancel;
      $("#modal").hidden = false;
      $("#modalCancel").focus();
      const done = (v) => { $("#modal").hidden = true; document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") done(false); };
      document.addEventListener("keydown", onKey);
      $("#modalOk").onclick = () => done(true);
      $("#modalCancel").onclick = () => done(false);
    });
  }

  /* ================= Lưu trữ: máy tính hoặc GitHub ================= */
  const b64FromText = (s) => {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const textFromB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const b64FromBlob = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });

  /* ================= Tài khoản email + mật khẩu =================
   * Không lưu mật khẩu ở đâu cả. Mã GitHub được mã hoá AES-GCM bằng khoá sinh từ (email + mật khẩu)
   * qua PBKDF2-SHA256 600.000 vòng, lưu trong admin/auth.json. Đúng email + mật khẩu mới giải mã được.
   */
  const AUTH_PATH = "admin/auth.json";
  const KDF_ITER = 600000;
  const te = new TextEncoder();
  const toB64 = (buf) => { const u = new Uint8Array(buf); let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const normEmail = (e) => String(e || "").trim().toLowerCase();
  const maskEmail = (e) => { const [u, d] = normEmail(e).split("@"); return `${u.slice(0, 2)}***@${d || ""}`; };
  const emailId = async (email) => toB64(await crypto.subtle.digest("SHA-256", te.encode("dnkns-admin:" + normEmail(email))));
  async function deriveKey(email, pass, salt, iter) {
    const base = await crypto.subtle.importKey("raw", te.encode(normEmail(email) + "\n" + pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function sealAccount(email, pass, payload) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(email, pass, salt, KDF_ITER);
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(payload)));
    return { id: await emailId(email), hint: maskEmail(email), kdf: "PBKDF2-SHA256", iter: KDF_ITER, salt: toB64(salt), iv: toB64(iv), data: toB64(data), updated: today() };
  }
  async function openAccount(acc, email, pass) {
    const key = await deriveKey(email, pass, fromB64(acc.salt), acc.iter);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(acc.iv) }, key, fromB64(acc.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  // Đọc danh sách tài khoản đã xuất bản trên web (không cần đăng nhập)
  async function loadAuthPublic() {
    try {
      const r = await fetch(`auth.json?v=${Date.now()}`, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }
  // Đọc/ghi admin/auth.json trên GitHub (cần đăng nhập bằng mã GitHub)
  async function readAuthRemote() {
    try {
      const f = await gh(`/contents/${AUTH_PATH}?ref=${encodeURIComponent(conn.branch)}`);
      return { auth: JSON.parse(textFromB64(f.content)), sha: f.sha };
    } catch (e) {
      if (e.status === 404) return { auth: { v: 1, accounts: [] }, sha: null };
      throw e;
    }
  }
  async function writeAuthRemote(auth, fileSha, message) {
    await gh(`/contents/${AUTH_PATH}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: b64FromText(JSON.stringify(auth, null, 2) + "\n"), branch: conn.branch, ...(fileSha ? { sha: fileSha } : {}) }),
    });
  }

  async function gh(path, opts = {}) {
    const r = await fetch(`https://api.github.com/repos/${conn.owner}/${conn.repo}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${conn.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!r.ok) {
      const e = new Error(`GitHub ${r.status}`);
      e.status = r.status;
      e.body = await r.json().catch(() => ({}));
      throw e;
    }
    return r.status === 204 ? null : r.json();
  }

  const ghError = (e) => {
    if (e.status === 401) return "Mã truy cập không đúng hoặc đã hết hạn. Hãy đăng xuất rồi nhập mã mới.";
    if (e.status === 403) return "Mã truy cập chưa có quyền ghi (Contents: Read and write) cho repo này.";
    if (e.status === 404) return "Không tìm thấy repo hoặc mã truy cập chưa được cấp quyền cho repo này.";
    if (e.status === 409 || e.status === 422) return "Nội dung trên GitHub vừa được thay đổi ở nơi khác. Hãy tải lại trang quản trị để lấy bản mới nhất rồi sửa lại.";
    if (e instanceof TypeError) return "Không kết nối được GitHub. Kiểm tra mạng rồi thử lại.";
    return `Lỗi không mong muốn (${esc(e.message)}). Vui lòng thử lại.`;
  };

  const store = {
    async load() {
      if (IS_LOCAL) {
        const r = await fetch(`../${DATA_PATH}?v=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`Không đọc được ${DATA_PATH} (${r.status})`);
        return { json: await r.text(), sha: null };
      }
      const f = await gh(`/contents/${DATA_PATH}?ref=${encodeURIComponent(conn.branch)}`);
      return { json: textFromB64(f.content), sha: f.sha };
    },
    async save(text, message) {
      if (IS_LOCAL) {
        const r = await fetch(`/__save?path=${encodeURIComponent(DATA_PATH)}`, { method: "PUT", body: text });
        if (!r.ok) throw new Error(`Máy chủ chạy thử không lưu được (${r.status}). Hãy chạy lại serve.ps1 bản mới.`);
        return;
      }
      const res = await gh(`/contents/${DATA_PATH}`, {
        method: "PUT",
        body: JSON.stringify({ message, content: b64FromText(text), sha, branch: conn.branch }),
      });
      sha = res.content.sha;
    },
    async upload(path, blob) {
      if (IS_LOCAL) {
        const r = await fetch(`/__save?path=${encodeURIComponent(path)}`, { method: "PUT", body: blob });
        if (!r.ok) throw new Error(`Máy chủ chạy thử không lưu được ảnh (${r.status}).`);
        return;
      }
      await gh(`/contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({ message: `Tải ảnh ${path.split("/").pop()} từ trang quản trị`, content: await b64FromBlob(blob), branch: conn.branch }),
      });
    },
  };

  // Thu nhỏ ảnh trước khi tải lên để web nhẹ (giữ nguyên GIF/SVG)
  async function compress(file, maxW) {
    if (!/^image\/(jpeg|png|webp|bmp)$/.test(file.type)) return { blob: file, ext: (file.name.split(".").pop() || "img").toLowerCase() };
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxW / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.85));
    return blob && blob.size < file.size ? { blob, ext: "webp" } : { blob: file, ext: (file.name.split(".").pop() || "jpg").toLowerCase() };
  }

  // Chọn ảnh → nén → tải lên → trả về đường dẫn ảnh (images/uploads/…)
  function pickImage(maxW = 1600) {
    return new Promise((resolve) => {
      const fp = $("#filePicker");
      fp.value = "";
      fp.onchange = async () => {
        const file = fp.files[0];
        if (!file) return resolve(null);
        if (file.size > 20 * 1024 * 1024) { toast("Ảnh lớn hơn 20 MB. Hãy chọn ảnh nhỏ hơn.", "err"); return resolve(null); }
        toast("Đang tải ảnh lên…", "info", 2500);
        try {
          const { blob, ext } = await compress(file, maxW);
          const base = slugify(file.name.replace(/\.[^.]+$/, "")).slice(0, 50);
          const path = `${UPLOAD_DIR}/${base}-${Date.now().toString(36)}.${ext}`;
          await store.upload(path, blob);
          previews[path] = URL.createObjectURL(blob);
          toast("Đã tải ảnh lên.");
          resolve(path);
        } catch (e) {
          toast(IS_LOCAL ? esc(e.message) : ghError(e), "err", 7000);
          resolve(null);
        }
      };
      fp.click();
    });
  }

  /* ================= Xuất bản ================= */
  function refreshDirty() {
    const dirty = isDirty();
    $("#publishBtn").disabled = !dirty;
    $("#dirtyLabel").hidden = !dirty;
    $("#discardBtn").hidden = !dirty;
    const n = changes.length;
    $("#dirtyCount").textContent = n ? `${n} thay đổi chưa xuất bản` : "Có thay đổi chưa xuất bản";
  }

  async function publish() {
    if (!isDirty()) return;
    const btn = $("#publishBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang xuất bản…`;
    const uniq = [...new Set(changes)];
    const message = `Quản trị: ${uniq.slice(0, 3).join("; ") || "cập nhật nội dung"}${uniq.length > 3 ? ` (+${uniq.length - 3})` : ""}`;
    try {
      const text = JSON.stringify(data, null, 2) + "\n";
      await store.save(text, message);
      savedJSON = JSON.stringify(data);
      changes = [];
      toast(IS_LOCAL ? "Đã lưu vào máy. Tải lại trang web để xem." : "Đã xuất bản! Trang web sẽ cập nhật sau khoảng 1–2 phút.", "ok", 6000);
    } catch (e) {
      toast(IS_LOCAL ? esc(e.message) : ghError(e), "err", 9000);
    }
    btn.innerHTML = `<i class="fas fa-cloud-arrow-up"></i> Xuất bản`;
    refreshDirty();
  }

  async function discard() {
    const ok = await confirmBox({ title: "Bỏ các thay đổi chưa xuất bản?", text: "Nội dung sẽ quay về bản đang có trên web. Không thể hoàn tác.", ok: "Bỏ thay đổi" });
    if (!ok) return;
    data = JSON.parse(savedJSON);
    changes = [];
    refreshDirty();
    render();
    toast("Đã bỏ các thay đổi.", "info");
  }

  /* ================= Các màn hình ================= */
  const view = () => $("#view");
  const setTitle = (t) => { $("#pageTitle").textContent = t; document.title = `${t} – Quản trị`; };

  // ---------- Tổng quan ----------
  function pageDashboard() {
    setTitle("Tổng quan");
    const pub = data.posts.filter((p) => p.status !== "draft");
    const drafts = data.posts.filter((p) => p.status === "draft");
    const recent = [...data.posts].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
    const top = [...pub].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    view().innerHTML = `
      <div class="stats">
        <a class="stat" href="#/bai-viet"><i class="fas fa-file-lines"></i><div><b>${pub.length}</b><span>Bài đã đăng</span></div></a>
        <a class="stat" href="#/bai-viet?status=draft"><i class="fas fa-pen-ruler"></i><div><b>${drafts.length}</b><span>Bản nháp</span></div></a>
        <a class="stat" href="#/danh-muc"><i class="fas fa-folder-tree"></i><div><b>${data.categories.length}</b><span>Danh mục</span></div></a>
        <a class="stat" href="#/banner"><i class="fas fa-images"></i><div><b>${(data.site.banners || []).length}</b><span>Ảnh banner</span></div></a>
      </div>
      <div class="card">
        <div class="card__head"><h3>Bài viết gần đây</h3><a class="btn btn--primary" href="#/bai-viet/moi"><i class="fas fa-plus"></i> Viết bài mới</a></div>
        ${recent.length ? `<div class="table-wrap"><table><tbody>${recent.map(rowPost).join("")}</tbody></table></div>`
          : `<div class="empty"><i class="fas fa-file-circle-plus"></i>Chưa có bài viết nào. Bấm “Viết bài mới” để bắt đầu.</div>`}
      </div>
      <div class="card">
        <h3>Đọc nhiều nhất</h3>
        ${top.length ? `<ol>${top.map((p) => `<li><a href="#/bai-viet/sua/${encodeURIComponent(p.id)}">${esc(p.title)}</a> <span class="muted">· ${(p.views || 0).toLocaleString("vi-VN")} lượt xem</span></li>`).join("")}</ol>`
          : `<p class="muted">Chưa có dữ liệu.</p>`}
      </div>`;
    bindRowActions();
  }

  // ---------- Danh sách bài ----------
  const rowPost = (p) => `
    <tr>
      <td class="hide-sm" style="width:76px"><img class="thumb" src="${esc(imgSrc(p.img))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></td>
      <td>
        <a class="title-link" href="#/bai-viet/sua/${encodeURIComponent(p.id)}">${esc(p.title || "(Chưa có tiêu đề)")}</a>
        <div>${(p.cats || []).map((c) => `<span class="badge badge--cat">${esc(catName(c))}</span>`).join("")}</div>
      </td>
      <td class="hide-sm" style="white-space:nowrap">${fmtDate(p.date)}</td>
      <td>${p.status === "draft" ? `<span class="badge badge--draft">Bản nháp</span>` : `<span class="badge badge--ok">Đã đăng</span>`}</td>
      <td class="actions">
        <a class="icon-btn" href="#/bai-viet/sua/${encodeURIComponent(p.id)}" title="Sửa bài"><i class="fas fa-pen"></i></a>
        <button class="icon-btn icon-btn--danger" data-del="${esc(p.id)}" title="Xoá bài"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;

  function bindRowActions() {
    $$("[data-del]").forEach((b) => (b.onclick = async () => {
      const p = data.posts.find((x) => x.id === b.dataset.del);
      if (!p) return;
      const ok = await confirmBox({ title: `Xoá bài “${p.title}”?`, text: "Bài sẽ bị gỡ khỏi web sau khi bấm Xuất bản. Bạn vẫn có thể bấm “Bỏ thay đổi” trước khi xuất bản.", ok: "Xoá bài" });
      if (!ok) return;
      data.posts = data.posts.filter((x) => x !== p);
      note(`Xoá bài "${p.title}"`);
      render();
      toast("Đã xoá bài. Bấm Xuất bản để cập nhật web.");
    }));
  }

  function pagePosts(params) {
    setTitle("Bài viết");
    const q = params.get("q") || "", cat = params.get("cat") || "", status = params.get("status") || "";
    view().innerHTML = `
      <div class="card">
        <div class="toolbar">
          <input type="search" id="fQ" placeholder="Tìm theo tiêu đề…" value="${esc(q)}">
          <select id="fCat"><option value="">Tất cả danh mục</option>${data.categories.map((c) => `<option value="${esc(c.slug)}" ${c.slug === cat ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
          <select id="fStatus">
            <option value="">Mọi trạng thái</option>
            <option value="published" ${status === "published" ? "selected" : ""}>Đã đăng</option>
            <option value="draft" ${status === "draft" ? "selected" : ""}>Bản nháp</option>
          </select>
          <a class="btn btn--primary" href="#/bai-viet/moi"><i class="fas fa-plus"></i> Viết bài mới</a>
        </div>
        <div id="postTable"></div>
      </div>`;
    const draw = () => {
      const nq = norm($("#fQ").value);
      const c = $("#fCat").value, s = $("#fStatus").value;
      const list = [...data.posts]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .filter((p) => (!nq || norm(p.title).includes(nq))
          && (!c || (p.cats || []).includes(c))
          && (!s || (s === "draft" ? p.status === "draft" : p.status !== "draft")));
      $("#postTable").innerHTML = list.length
        ? `<div class="table-wrap"><table><thead><tr><th class="hide-sm"></th><th>Tiêu đề</th><th class="hide-sm">Ngày đăng</th><th>Trạng thái</th><th></th></tr></thead><tbody>${list.map(rowPost).join("")}</tbody></table></div>
           <p class="muted" style="margin:12px 0 0;font-size:13px">${list.length} / ${data.posts.length} bài</p>`
        : `<div class="empty"><i class="fas fa-magnifying-glass"></i>Không có bài viết nào khớp bộ lọc. Thử bỏ bớt điều kiện lọc.</div>`;
      bindRowActions();
    };
    $("#fQ").oninput = draw; $("#fCat").onchange = draw; $("#fStatus").onchange = draw;
    draw();
  }

  // ---------- Soạn / sửa bài ----------
  function pageEditor(id) {
    const existing = id ? data.posts.find((p) => p.id === id) : null;
    if (id && !existing) {
      setTitle("Không tìm thấy bài");
      view().innerHTML = `<div class="card empty"><i class="fas fa-circle-question"></i>Bài viết này không còn tồn tại. <a href="#/bai-viet">Về danh sách bài</a></div>`;
      return;
    }
    const p = existing ? structuredClone(existing) : { id: "", title: "", status: "draft", cats: [], date: today(), img: "", excerpt: "", content: "", views: 0 };
    let slugTouched = !!existing;
    setTitle(existing ? "Sửa bài viết" : "Viết bài mới");

    view().innerHTML = `
      <form class="editor" id="edForm" autocomplete="off">
        <div>
          <div class="card">
            <label>Tiêu đề <input type="text" id="edTitle" class="title-input" required maxlength="200" value="${esc(p.title)}" placeholder="Nhập tiêu đề bài viết"></label>
            <div class="slug-row"><i class="fas fa-link"></i> Đường dẫn: <code>#/bai-viet/</code><input id="edSlug" value="${esc(p.id)}" placeholder="tu-dong-tao-tu-tieu-de"></div>

            <label>Nội dung</label>
            <div class="md-tools" id="mdTools">
              <button type="button" data-md="h2" title="Tiêu đề lớn"><i class="fas fa-heading"></i></button>
              <button type="button" data-md="h3" title="Tiêu đề nhỏ" style="font-size:12px"><i class="fas fa-heading"></i></button>
              <span class="sep"></span>
              <button type="button" data-md="b" title="In đậm"><i class="fas fa-bold"></i></button>
              <button type="button" data-md="i" title="In nghiêng"><i class="fas fa-italic"></i></button>
              <button type="button" data-md="quote" title="Trích dẫn"><i class="fas fa-quote-left"></i></button>
              <button type="button" data-md="ul" title="Danh sách"><i class="fas fa-list-ul"></i></button>
              <button type="button" data-md="ol" title="Danh sách đánh số"><i class="fas fa-list-ol"></i></button>
              <span class="sep"></span>
              <button type="button" data-md="link" title="Chèn liên kết"><i class="fas fa-link"></i></button>
              <button type="button" data-md="img" title="Chèn ảnh"><i class="fas fa-image"></i></button>
              <div class="tabs"><button type="button" class="on" data-tab="write">Soạn</button><button type="button" data-tab="preview">Xem trước</button></div>
            </div>
            <textarea id="edContent" class="md-area" placeholder="Viết nội dung bài ở đây…&#10;&#10;Dòng trống để tách đoạn. Dùng các nút phía trên để định dạng.">${esc(p.content)}</textarea>
            <div class="md-preview" id="edPreview" hidden></div>
            <p class="md-help">Mẹo: <code>## Tiêu đề</code> · <code>**đậm**</code> · <code>*nghiêng*</code> · <code>- danh sách</code> · <code>&gt; trích dẫn</code> · <code>[chữ](https://…)</code></p>
          </div>

          <div class="card">
            <label>Đoạn tóm tắt <span class="count-note" id="exCount"></span>
              <span class="hint">Hiện ở danh sách bài và khi chia sẻ. Để trống sẽ tự lấy từ đầu nội dung.</span>
              <textarea id="edExcerpt" rows="3" maxlength="300">${esc(p.excerpt)}</textarea>
            </label>
            <button type="button" class="btn btn--sm" id="autoEx"><i class="fas fa-wand-magic-sparkles"></i> Tạo từ nội dung</button>
          </div>
        </div>

        <div class="editor__side">
          <div class="card">
            <label>Trạng thái
              <select id="edStatus">
                <option value="published" ${p.status !== "draft" ? "selected" : ""}>Đã đăng – hiện trên web</option>
                <option value="draft" ${p.status === "draft" ? "selected" : ""}>Bản nháp – ẩn khỏi web</option>
              </select>
            </label>
            <label>Ngày đăng <input type="date" id="edDate" value="${esc(p.date)}" required></label>
            <div class="side-actions">
              <button class="btn btn--navy btn--block" type="submit"><i class="fas fa-floppy-disk"></i> Lưu bài</button>
              <a class="btn btn--ghost btn--block" href="#/bai-viet">Huỷ</a>
            </div>
            <p class="md-help" style="margin-top:10px">Sau khi lưu, bấm <b>Xuất bản</b> ở góc trên để đưa lên web.</p>
          </div>

          <div class="card">
            <label>Ảnh đại diện</label>
            <div class="img-pick" id="edImgPick">${p.img ? `<img src="${esc(imgSrc(p.img))}" alt="">` : `<div class="ph"><i class="fas fa-cloud-arrow-up"></i>Bấm để tải ảnh lên</div>`}</div>
            <div class="img-row"><input id="edImg" value="${esc(p.img)}" placeholder="hoặc dán link ảnh https://…"><button type="button" class="icon-btn icon-btn--danger" id="edImgClear" title="Bỏ ảnh"><i class="fas fa-xmark"></i></button></div>
          </div>

          <div class="card">
            <label>Danh mục</label>
            <div class="cats-box">${data.categories.map((c) => `<label class="check"><input type="checkbox" value="${esc(c.slug)}" ${p.cats.includes(c.slug) ? "checked" : ""}> ${esc(c.name)}</label>`).join("") || `<span class="muted">Chưa có danh mục. <a href="#/danh-muc">Thêm danh mục</a></span>`}</div>
            <label style="margin-top:14px">Lượt xem <span class="hint">Dùng để xếp mục “Đọc nhiều”, “Tin nổi bật”.</span><input type="number" id="edViews" min="0" value="${Number(p.views) || 0}"></label>
          </div>
        </div>
      </form>`;

    const title = $("#edTitle"), slug = $("#edSlug"), content = $("#edContent"), excerpt = $("#edExcerpt");
    title.oninput = () => { if (!slugTouched) slug.value = slugify(title.value); };
    slug.oninput = () => { slugTouched = true; };
    slug.onblur = () => { slug.value = slugify(slug.value || title.value); };
    const exCount = () => ($("#exCount").textContent = `${excerpt.value.length}/300`);
    excerpt.oninput = exCount; exCount();
    $("#autoEx").onclick = () => { excerpt.value = makeExcerpt(content.value); exCount(); };

    // Ảnh đại diện
    const showImg = (src) => {
      $("#edImgPick").innerHTML = src ? `<img src="${esc(imgSrc(src))}" alt="">` : `<div class="ph"><i class="fas fa-cloud-arrow-up"></i>Bấm để tải ảnh lên</div>`;
    };
    $("#edImgPick").onclick = async () => { const path = await pickImage(1600); if (path) { $("#edImg").value = path; showImg(path); } };
    $("#edImg").onchange = () => showImg($("#edImg").value.trim());
    $("#edImgClear").onclick = () => { $("#edImg").value = ""; showImg(""); };

    // Thanh công cụ định dạng
    const wrap = (before, after = before, ph = "chữ") => {
      const s = content.selectionStart, e = content.selectionEnd, sel = content.value.slice(s, e) || ph;
      content.setRangeText(before + sel + after, s, e, "end");
      content.focus();
      content.setSelectionRange(s + before.length, s + before.length + sel.length);
    };
    const linePrefix = (prefix) => {
      const s = content.selectionStart, e = content.selectionEnd;
      const start = content.value.lastIndexOf("\n", s - 1) + 1;
      const block = content.value.slice(start, e) || "";
      const lines = block.split("\n").map((l, i) => (prefix === "1. " ? `${i + 1}. ` : prefix) + l.replace(/^(#{2,4} |> |- |\d+\. )/, ""));
      content.setRangeText(lines.join("\n"), start, e, "end");
      content.focus();
    };
    $$("[data-md]").forEach((b) => (b.onclick = async () => {
      const k = b.dataset.md;
      if (k === "b") wrap("**");
      else if (k === "i") wrap("*");
      else if (k === "h2") linePrefix("## ");
      else if (k === "h3") linePrefix("### ");
      else if (k === "quote") linePrefix("> ");
      else if (k === "ul") linePrefix("- ");
      else if (k === "ol") linePrefix("1. ");
      else if (k === "link") {
        const url = prompt("Dán đường link (https://…):", "https://");
        if (url && url !== "https://") wrap("[", `](${url.trim()})`, "chữ hiển thị");
      } else if (k === "img") {
        const path = await pickImage(1400);
        if (path) {
          const pos = content.selectionEnd;
          content.setRangeText(`\n\n![Mô tả ảnh](${path})\n\n`, pos, pos, "end");
          content.focus();
        }
      }
    }));
    $$("#mdTools [data-tab]").forEach((b) => (b.onclick = () => {
      const prev = b.dataset.tab === "preview";
      $$("#mdTools [data-tab]").forEach((x) => x.classList.toggle("on", x === b));
      content.hidden = prev;
      $("#edPreview").hidden = !prev;
      if (prev) {
        const html = markdown(content.value) || `<p class="muted">Chưa có nội dung.</p>`;
        $("#edPreview").innerHTML = html.replace(/src="([^"]+)"/g, (_, s) => `src="${esc(imgSrc(s.replace(/&amp;/g, "&")))}"`);
      }
    }));

    // Lưu bài vào danh sách (chưa xuất bản)
    $("#edForm").onsubmit = (ev) => {
      ev.preventDefault();
      const t = title.value.trim();
      if (!t) { toast("Hãy nhập tiêu đề bài viết.", "err"); title.focus(); return; }
      let newId = slugify(slug.value || t);
      const clash = (x) => data.posts.some((q) => q.id === x && q !== existing);
      if (clash(newId)) { let n = 2; while (clash(`${newId}-${n}`)) n++; newId = `${newId}-${n}`; }
      const updated = {
        id: newId,
        title: t,
        status: $("#edStatus").value,
        cats: $$(".cats-box input:checked").map((x) => x.value),
        date: $("#edDate").value || today(),
        img: $("#edImg").value.trim(),
        excerpt: excerpt.value.trim() || makeExcerpt(content.value),
        content: content.value.replace(/\s+$/, ""),
        views: Math.max(0, parseInt($("#edViews").value, 10) || 0),
      };
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(updated)) { toast("Không có gì thay đổi.", "info"); location.hash = "#/bai-viet"; return; }
        data.posts[data.posts.indexOf(existing)] = updated;
        note(`Sửa bài "${t}"`);
      } else {
        data.posts.unshift(updated);
        note(`Thêm bài "${t}"`);
      }
      leaveGuard = false;
      location.hash = "#/bai-viet";
      toast(updated.status === "draft" ? "Đã lưu bản nháp. Bản nháp không hiện trên web." : "Đã lưu bài. Bấm Xuất bản để đưa lên web.");
    };

    // Cảnh báo khi rời trang soạn mà chưa lưu
    const snapshot = () => [title.value, content.value, excerpt.value, $("#edImg").value, $("#edStatus").value, $("#edDate").value, $$(".cats-box input:checked").length, $("#edViews").value].join("\u0001");
    const initial = snapshot();
    leaveGuard = () => snapshot() !== initial;
  }

  // ---------- Banner ----------
  function pageBanners() {
    setTitle("Banner");
    const s = data.site;
    s.banners = s.banners || [];
    view().innerHTML = `
      <div class="card">
        <div class="card__head"><h3>Ảnh trượt đầu trang</h3><button class="btn btn--primary" id="bnAdd"><i class="fas fa-plus"></i> Thêm ảnh banner</button></div>
        <p class="muted" style="margin-top:-6px">Khổ ảnh nên là <b>1781 × 687</b> (tỉ lệ khoảng 2,6 : 1). Ảnh trượt từ phải sang trái theo thứ tự dưới đây.</p>
        <div class="banners" id="bnList"></div>
      </div>
      <div class="card">
        <h3>Cài đặt banner</h3>
        <div class="grid2">
          <label>Thời gian mỗi ảnh (giây)<input type="number" id="bnDelay" min="2" max="30" step="0.5" value="${(s.bannerDelay || 5000) / 1000}"></label>
          <div>
            <label class="check" style="margin-top:28px"><input type="checkbox" id="bnLogo" ${s.bannerHasLogo ? "checked" : ""}> Ảnh banner đã có sẵn logo và tên trang</label>
            <p class="md-help">Bỏ chọn nếu ảnh không có logo, web sẽ tự đặt logo và tên trang lên góc trái banner.</p>
          </div>
        </div>
      </div>`;

    const draw = () => {
      $("#bnList").innerHTML = s.banners.length ? s.banners.map((b, i) => `
        <div class="banner-item">
          <div><div class="num">Ảnh ${i + 1}</div><div class="img-pick" data-pick="${i}" title="Bấm để đổi ảnh"><img src="${esc(imgSrc(b.img))}" alt=""></div></div>
          <div>
            <label>Mô tả ảnh <span class="hint">Cho người dùng trình đọc màn hình và Google.</span><input type="text" data-f="alt" data-i="${i}" value="${esc(b.alt)}"></label>
            <label>Link khi bấm vào ảnh <span class="hint">Để trống nếu không cần.</span><input type="url" data-f="link" data-i="${i}" value="${esc(b.link)}" placeholder="https://…"></label>
          </div>
          <div class="tools">
            <button class="icon-btn" data-up="${i}" title="Lên trước" ${i === 0 ? "disabled" : ""}><i class="fas fa-arrow-up"></i></button>
            <button class="icon-btn" data-down="${i}" title="Xuống sau" ${i === s.banners.length - 1 ? "disabled" : ""}><i class="fas fa-arrow-down"></i></button>
            <button class="icon-btn icon-btn--danger" data-rm="${i}" title="Xoá ảnh"><i class="fas fa-trash"></i></button>
          </div>
        </div>`).join("")
        : `<div class="empty"><i class="fas fa-image"></i>Chưa có ảnh banner. Bấm “Thêm ảnh banner” để tải ảnh lên.</div>`;

      $$("[data-f]").forEach((inp) => (inp.onchange = () => { s.banners[inp.dataset.i][inp.dataset.f] = inp.value.trim(); note("Sửa banner"); }));
      $$("[data-pick]").forEach((el) => (el.onclick = async () => {
        const path = await pickImage(1920);
        if (path) { s.banners[el.dataset.pick].img = path; note("Đổi ảnh banner"); draw(); }
      }));
      $$("[data-up]").forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [s.banners[i - 1], s.banners[i]] = [s.banners[i], s.banners[i - 1]]; note("Đổi thứ tự banner"); draw(); }));
      $$("[data-down]").forEach((b) => (b.onclick = () => { const i = +b.dataset.down; [s.banners[i + 1], s.banners[i]] = [s.banners[i], s.banners[i + 1]]; note("Đổi thứ tự banner"); draw(); }));
      $$("[data-rm]").forEach((b) => (b.onclick = async () => {
        const ok = await confirmBox({ title: `Xoá ảnh banner ${+b.dataset.rm + 1}?`, text: "Ảnh sẽ bị gỡ khỏi banner sau khi bấm Xuất bản.", ok: "Xoá ảnh" });
        if (!ok) return;
        s.banners.splice(+b.dataset.rm, 1); note("Xoá ảnh banner"); draw();
      }));
    };
    draw();

    $("#bnAdd").onclick = async () => {
      const path = await pickImage(1920);
      if (!path) return;
      s.banners.push({ img: path, alt: data.site.name || "", link: "" });
      note("Thêm ảnh banner");
      draw();
    };
    $("#bnDelay").onchange = (e) => { s.bannerDelay = Math.round(Math.min(30, Math.max(2, parseFloat(e.target.value) || 5)) * 1000); e.target.value = s.bannerDelay / 1000; note("Đổi thời gian banner"); };
    $("#bnLogo").onchange = (e) => { s.bannerHasLogo = e.target.checked; note("Đổi cài đặt logo banner"); };
  }

  // ---------- Danh mục ----------
  function pageCategories() {
    setTitle("Danh mục");
    view().innerHTML = `
      <div class="card">
        <div class="card__head"><h3>Danh mục bài viết</h3></div>
        <form class="toolbar" id="catAddForm">
          <input type="text" id="catNew" placeholder="Tên danh mục mới, ví dụ: Công nghệ" maxlength="60" style="flex:1;min-width:200px">
          <button class="btn btn--primary" type="submit" style="margin-left:0"><i class="fas fa-plus"></i> Thêm danh mục</button>
        </form>
        <div class="table-wrap"><table>
          <thead><tr><th>Tên</th><th class="hide-sm">Số bài</th><th title="Hiện trên thanh menu">Menu</th><th title="Hiện ở dải Chủ đề nổi bật">Chủ đề nổi bật</th><th></th></tr></thead>
          <tbody id="catBody"></tbody>
        </table></div>
        <p class="md-help">“Menu”: hiện trên thanh menu đầu trang. “Chủ đề nổi bật”: hiện ở dải chủ đề dưới menu.</p>
      </div>`;

    const draw = () => {
      const cats = data.categories;
      $("#catBody").innerHTML = cats.map((c, i) => {
        const n = data.posts.filter((p) => (p.cats || []).includes(c.slug)).length;
        return `<tr class="cat-row">
          <td><input type="text" data-name="${i}" value="${esc(c.name)}" maxlength="60"><div class="slug">#/danh-muc/${esc(c.slug)}</div></td>
          <td class="hide-sm">${n}</td>
          <td><input type="checkbox" data-menu="${i}" ${c.inMenu !== false ? "checked" : ""} aria-label="Hiện trên menu"></td>
          <td><input type="checkbox" data-tag="${i}" ${data.tags.includes(c.slug) ? "checked" : ""} aria-label="Chủ đề nổi bật"></td>
          <td class="actions">
            <button class="icon-btn" data-up="${i}" title="Lên trước" ${i === 0 ? "disabled" : ""}><i class="fas fa-arrow-up"></i></button>
            <button class="icon-btn" data-down="${i}" title="Xuống sau" ${i === cats.length - 1 ? "disabled" : ""}><i class="fas fa-arrow-down"></i></button>
            <button class="icon-btn icon-btn--danger" data-rm="${i}" title="Xoá danh mục"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
      }).join("") || `<tr><td colspan="5" class="empty">Chưa có danh mục nào.</td></tr>`;

      $$("[data-name]").forEach((inp) => (inp.onchange = () => {
        const v = inp.value.trim();
        if (!v) { inp.value = cats[inp.dataset.name].name; toast("Tên danh mục không được để trống.", "err"); return; }
        cats[inp.dataset.name].name = v; note(`Đổi tên danh mục "${v}"`);
      }));
      $$("[data-menu]").forEach((cb) => (cb.onchange = () => { cats[cb.dataset.menu].inMenu = cb.checked; note("Sửa menu"); }));
      $$("[data-tag]").forEach((cb) => (cb.onchange = () => {
        const slug = cats[cb.dataset.tag].slug;
        data.tags = cb.checked ? [...data.tags, slug] : data.tags.filter((t) => t !== slug);
        note("Sửa chủ đề nổi bật");
      }));
      $$("[data-up]").forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]]; note("Đổi thứ tự danh mục"); draw(); }));
      $$("[data-down]").forEach((b) => (b.onclick = () => { const i = +b.dataset.down; [cats[i + 1], cats[i]] = [cats[i], cats[i + 1]]; note("Đổi thứ tự danh mục"); draw(); }));
      $$("[data-rm]").forEach((b) => (b.onclick = async () => {
        const c = cats[+b.dataset.rm];
        const n = data.posts.filter((p) => (p.cats || []).includes(c.slug)).length;
        const ok = await confirmBox({
          title: `Xoá danh mục “${c.name}”?`,
          text: n ? `${n} bài đang thuộc danh mục này. Các bài vẫn được giữ, chỉ bị gỡ khỏi danh mục.` : "Danh mục này chưa có bài nào.",
          ok: "Xoá danh mục",
        });
        if (!ok) return;
        data.categories = cats.filter((x) => x !== c);
        data.tags = data.tags.filter((t) => t !== c.slug);
        data.posts.forEach((p) => { p.cats = (p.cats || []).filter((x) => x !== c.slug); });
        note(`Xoá danh mục "${c.name}"`);
        pageCategories();
      }));
    };
    draw();

    $("#catAddForm").onsubmit = (e) => {
      e.preventDefault();
      const name = $("#catNew").value.trim();
      if (!name) return;
      let slug = slugify(name), n = 2;
      while (data.categories.some((c) => c.slug === slug)) slug = `${slugify(name)}-${n++}`;
      data.categories.push({ slug, name, inMenu: true });
      note(`Thêm danh mục "${name}"`);
      $("#catNew").value = "";
      draw();
      toast(`Đã thêm danh mục “${esc(name)}”.`);
    };
  }

  // ---------- Cài đặt trang ----------
  function pageSettings() {
    setTitle("Cài đặt trang");
    const s = data.site;
    view().innerHTML = `
      <div class="card">
        <h3>Thông tin chung</h3>
        <div class="grid2">
          <label>Tên trang<input type="text" data-k="name" value="${esc(s.name)}" maxlength="80"></label>
          <label>Khẩu hiệu<input type="text" data-k="tagline" value="${esc(s.tagline)}" maxlength="120"></label>
        </div>
        <label>Câu giới thiệu <span class="hint">Hiện ở chân trang và dưới logo (khi banner không có sẵn logo).</span><textarea data-k="intro" rows="2" maxlength="200">${esc(s.intro)}</textarea></label>
        <label>Tên tác giả mặc định <span class="hint">Hiện dưới mỗi bài viết.</span><input type="text" data-k="author" value="${esc(s.author)}" maxlength="60"></label>
      </div>
      <div class="card">
        <h3>Logo</h3>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <div class="img-pick" id="logoPick" style="width:120px;aspect-ratio:1;border-radius:50%;margin:0">${s.logo ? `<img src="${esc(imgSrc(s.logo))}" alt="" style="object-fit:contain">` : `<div class="ph"><i class="fas fa-cloud-arrow-up"></i>Tải logo</div>`}</div>
          <p class="muted" style="flex:1;min-width:200px;margin:0">Bấm vào ô tròn để đổi logo. Nên dùng ảnh vuông, nền trắng hoặc trong suốt.</p>
        </div>
      </div>
      <div class="card" id="accCard">
        <h3>Tài khoản đăng nhập trang quản trị</h3>
        ${IS_LOCAL
          ? `<p class="muted" style="margin:0">Tạo tài khoản email chỉ làm được trên bản online (doanhnhankynguyenso.com/admin/), vì cần mã GitHub để mã hoá.</p>`
          : `<p class="muted" style="margin-top:-6px">Đăng nhập bằng email + mật khẩu thay cho mã GitHub. Mật khẩu không được lưu ở đâu cả, chỉ dùng để mở khoá mã GitHub đang dùng.</p>
             <ul class="acc-list" id="accList"><li class="muted">Đang tải…</li></ul>
             <form id="accForm" autocomplete="off">
               <div class="grid3">
                 <label>Email<input type="email" id="accEmail" required autocomplete="off"></label>
                 <label>Mật khẩu <span class="pw-wrap"><input type="password" id="accPass" required minlength="10" autocomplete="new-password"><button type="button" class="pw-eye" data-eye="accPass" aria-label="Hiện mật khẩu"><i class="fas fa-eye"></i></button></span></label>
                 <label>Nhập lại mật khẩu<input type="password" id="accPass2" required autocomplete="new-password"></label>
               </div>
               <button class="btn btn--navy" type="submit" id="accBtn"><i class="fas fa-user-plus"></i> Lưu tài khoản</button>
               <p class="md-help">Mật khẩu ít nhất 10 ký tự, nên dùng mật khẩu riêng, không trùng mật khẩu email.
               Lưu lại cùng email sẽ đổi mật khẩu. Khi mã GitHub hết hạn, đăng nhập bằng mã mới rồi lưu lại tài khoản.</p>
             </form>`}
      </div>
      <div class="card">
        <h3>Kết nối</h3>
        <p class="muted" style="margin:0">${IS_LOCAL
          ? `Đang chạy trên máy: thay đổi được lưu thẳng vào thư mục dự án. Đẩy lên GitHub để cập nhật web thật.`
          : `Đang lưu vào GitHub: <b>${esc(conn.owner)}/${esc(conn.repo)}</b> (nhánh <b>${esc(conn.branch)}</b>).`}</p>
      </div>`;
    $$("[data-k]").forEach((inp) => (inp.onchange = () => { s[inp.dataset.k] = inp.value.trim(); note("Sửa cài đặt trang"); }));
    if (!IS_LOCAL) bindAccounts();
    $("#logoPick").onclick = async () => {
      const path = await pickImage(512);
      if (!path) return;
      s.logo = path; note("Đổi logo"); pageSettings();
    };
  }

  // Quản lý tài khoản email (ghi thẳng lên GitHub, không qua nút Xuất bản)
  async function bindAccounts() {
    const list = $("#accList");
    const draw = (auth) => {
      const accs = (auth && auth.accounts) || [];
      list.innerHTML = accs.length
        ? accs.map((a, i) => `<li><span><i class="fas fa-user"></i> ${esc(a.hint || "Tài khoản")} <span class="muted">· cập nhật ${fmtDate(a.updated)}</span></span>
            <button class="icon-btn icon-btn--danger" data-acc-rm="${i}" title="Xoá tài khoản"><i class="fas fa-trash"></i></button></li>`).join("")
        : `<li class="muted">Chưa có tài khoản nào. Đang đăng nhập bằng mã GitHub.</li>`;
      $$("[data-acc-rm]").forEach((b) => (b.onclick = async () => {
        const a = accs[+b.dataset.accRm];
        const ok = await confirmBox({ title: `Xoá tài khoản ${a.hint}?`, text: "Tài khoản này sẽ không đăng nhập được nữa. Bạn vẫn đăng nhập được bằng mã GitHub.", ok: "Xoá tài khoản" });
        if (!ok) return;
        try {
          const { auth: cur, sha: fsha } = await readAuthRemote();
          cur.accounts = (cur.accounts || []).filter((x) => x.id !== a.id);
          await writeAuthRemote(cur, fsha, "Xoá tài khoản đăng nhập trang quản trị");
          draw(cur);
          toast("Đã xoá tài khoản.");
        } catch (e) { toast(ghError(e), "err", 8000); }
      }));
    };
    try { draw((await readAuthRemote()).auth); } catch (e) { list.innerHTML = `<li class="form-err">${ghError(e)}</li>`; }

    $("#accForm").onsubmit = async (ev) => {
      ev.preventDefault();
      const email = $("#accEmail").value, p1 = $("#accPass").value, p2 = $("#accPass2").value;
      if (p1.length < 10) { toast("Mật khẩu cần ít nhất 10 ký tự.", "err"); return; }
      if (p1 !== p2) { toast("Hai ô mật khẩu chưa giống nhau.", "err"); $("#accPass2").focus(); return; }
      const btn = $("#accBtn");
      btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang mã hoá…`;
      try {
        const sealed = await sealAccount(email, p1, { owner: conn.owner, repo: conn.repo, branch: conn.branch, token: conn.token });
        const { auth: cur, sha: fsha } = await readAuthRemote();
        cur.v = 1;
        cur.accounts = [...(cur.accounts || []).filter((x) => x.id !== sealed.id), sealed];
        await writeAuthRemote(cur, fsha, "Cập nhật tài khoản đăng nhập trang quản trị");
        $("#accForm").reset();
        draw(cur);
        toast(`Đã lưu tài khoản ${esc(sealed.hint)}. Khoảng 1–2 phút nữa đăng nhập bằng email được.`, "ok", 8000);
      } catch (e) {
        toast(e.status ? ghError(e)
          : !window.isSecureContext ? "Trang đang mở bằng http (không bảo mật) nên trình duyệt chặn mã hoá. Hãy mở trang quản trị bằng địa chỉ https://… rồi thử lại."
          : "Không mã hoá được. Hãy dùng trình duyệt mới (Chrome, Edge, Safari) rồi thử lại.", "err", 9000);
      }
      btn.disabled = false; btn.innerHTML = `<i class="fas fa-user-plus"></i> Lưu tài khoản`;
    };
  }

  /* ================= Điều hướng ================= */
  let leaveGuard = false;
  let lastHash = "";
  async function render() {
    if (!data) return;
    const hash = location.hash || "#/tong-quan";
    const [pathPart, query = ""] = hash.slice(2).split("?");
    const parts = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(query);
    $$(".side__nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === (parts[0] || "tong-quan")));
    $("#side").classList.remove("open");

    if (parts[0] === "bai-viet" && parts[1] === "moi") pageEditor(null);
    else if (parts[0] === "bai-viet" && parts[1] === "sua") pageEditor(parts[2]);
    else if (parts[0] === "bai-viet") pagePosts(params);
    else if (parts[0] === "banner") pageBanners();
    else if (parts[0] === "danh-muc") pageCategories();
    else if (parts[0] === "cai-dat") pageSettings();
    else pageDashboard();
    lastHash = location.hash;
    scrollTo({ top: 0 });
  }

  addEventListener("hashchange", async () => {
    if (location.hash === lastHash) return;
    if (typeof leaveGuard === "function" && leaveGuard()) {
      const target = location.hash;
      history.replaceState(null, "", lastHash || "#/tong-quan");
      const ok = await confirmBox({ title: "Rời trang mà không lưu bài?", text: "Những gì bạn vừa sửa trong bài này sẽ bị mất.", ok: "Rời trang", cancel: "Ở lại soạn tiếp" });
      if (!ok) return;
      leaveGuard = false;
      location.hash = target;
      return;
    }
    leaveGuard = false;
    render();
  });

  addEventListener("beforeunload", (e) => {
    if (isDirty() || (typeof leaveGuard === "function" && leaveGuard())) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ================= Khởi động ================= */
  const saveConn = (c, remember) => {
    const s = JSON.stringify(c);
    try {
      localStorage.removeItem(CONN_KEY); sessionStorage.removeItem(CONN_KEY);
      (remember ? localStorage : sessionStorage).setItem(CONN_KEY, s);
    } catch { /* trình duyệt chặn lưu trữ: vẫn dùng được trong phiên này */ }
  };
  const readConn = () => {
    try { return JSON.parse(sessionStorage.getItem(CONN_KEY) || localStorage.getItem(CONN_KEY) || "null"); } catch { return null; }
  };

  async function startApp() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#modeLabel").textContent = IS_LOCAL ? "Chế độ: chạy trên máy" : `GitHub: ${conn.owner}/${conn.repo}`;
    $("#logoutBtn").hidden = IS_LOCAL;
    try {
      const { json, sha: s } = await store.load();
      data = JSON.parse(json);
      data.site = data.site || {}; data.categories = data.categories || []; data.tags = data.tags || []; data.posts = data.posts || [];
      sha = s;
      savedJSON = JSON.stringify(data);
      refreshDirty();
      render();
    } catch (e) {
      view().innerHTML = `<div class="card empty"><i class="fas fa-triangle-exclamation"></i>${IS_LOCAL ? esc(e.message) : ghError(e)}</div>`;
    }
  }

  // Màn hình chỉ có Gmail + mật khẩu. Ô nhập mã GitHub được ẩn, chỉ hiện khi mở /admin/?ma-github
  // (dùng khi mã GitHub hết hạn cần làm mới, hoặc để tạo tài khoản Gmail mới).
  const TOKEN_MODE = new URLSearchParams(location.search).has("ma-github");
  function showLogin() {
    const g = guessRepo();
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#loginOwner").value = g.owner; $("#loginRepo").value = g.repo; $("#loginBranch").value = g.branch;
    $("#toPwWrap").hidden = false;
    showForm(TOKEN_MODE ? "token" : "pw");
  }
  const showForm = (which) => {
    $("#pwForm").hidden = which !== "pw";
    $("#loginForm").hidden = which === "pw";
    (which === "pw" ? $("#pwEmail") : $("#loginToken")).focus();
  };
  $("#toPw").onclick = () => showForm("pw");
  // Nút con mắt: hiện/ẩn mật khẩu
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-eye]");
    if (!b) return;
    const inp = document.getElementById(b.dataset.eye);
    inp.type = inp.type === "password" ? "text" : "password";
    b.innerHTML = `<i class="fas fa-eye${inp.type === "text" ? "-slash" : ""}"></i>`;
  });

  $("#pwForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#pwEmail").value, pass = $("#pwPass").value;
    const btn = $("#pwBtn"), err = $("#pwErr");
    if (!window.isSecureContext) {
      err.hidden = false;
      err.innerHTML = "Trang đang mở bằng http (không bảo mật) nên không đăng nhập bằng Gmail được. Hãy mở bằng địa chỉ <b>https://</b>.";
      return;
    }
    btn.disabled = true; btn.textContent = "Đang kiểm tra…"; err.hidden = true;
    try {
      const auth = await loadAuthPublic();
      if (!auth || !(auth.accounts || []).length) throw Object.assign(new Error("none"), { none: true });
      const id = await emailId(email);
      const acc = auth && (auth.accounts || []).find((a) => a.id === id);
      let payload = null;
      if (acc) { try { payload = await openAccount(acc, email, pass); } catch { payload = null; } }
      if (!payload) throw Object.assign(new Error("bad"), { bad: true });
      conn = payload;
      try {
        const repo = await gh("");
        if (!repo.permissions || !repo.permissions.push) throw Object.assign(new Error("no push"), { status: 403 });
      } catch (ge) {
        conn = null;
        throw Object.assign(new Error("token"), { tokenErr: ge.status === 401
          ? "Email và mật khẩu đúng, nhưng mã GitHub bên trong đã hết hạn hoặc bị thu hồi. Hãy mở <b>/admin/?ma-github</b>, đăng nhập bằng mã GitHub mới rồi vào Cài đặt trang để lưu lại tài khoản."
          : ghError(ge) });
      }
      saveConn(conn, $("#pwRemember").checked);
      $("#pwPass").value = "";
      await startApp();
    } catch (ex) {
      err.hidden = false;
      err.innerHTML = ex.none
        ? "Chưa có tài khoản Gmail nào. Hãy mở <b>/admin/?ma-github</b> để đăng nhập bằng mã GitHub, rồi vào <b>Cài đặt trang → Tài khoản đăng nhập</b> để tạo tài khoản."
        : ex.bad ? "Email hoặc mật khẩu không đúng." : ex.tokenErr || "Không đăng nhập được. Kiểm tra mạng rồi thử lại.";
    }
    btn.disabled = false; btn.textContent = "Đăng nhập";
  };

  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const c = { owner: $("#loginOwner").value.trim(), repo: $("#loginRepo").value.trim(), branch: $("#loginBranch").value.trim() || "main", token: $("#loginToken").value.trim() };
    const btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "Đang kiểm tra…";
    conn = c;
    try {
      const repo = await gh("");
      if (!repo.permissions || !repo.permissions.push) throw Object.assign(new Error("no push"), { status: 403 });
      saveConn(c, $("#loginRemember").checked);
      $("#loginToken").value = "";
      await startApp();
    } catch (err) {
      conn = null;
      $("#loginErr").hidden = false;
      $("#loginErr").innerHTML = ghError(err);
    }
    btn.disabled = false; btn.textContent = "Vào trang quản trị";
  };

  $("#logoutBtn").onclick = async () => {
    if (isDirty()) {
      const ok = await confirmBox({ title: "Đăng xuất khi còn thay đổi chưa xuất bản?", text: "Các thay đổi chưa xuất bản sẽ bị mất.", ok: "Đăng xuất" });
      if (!ok) return;
    }
    try { localStorage.removeItem(CONN_KEY); sessionStorage.removeItem(CONN_KEY); } catch {}
    data = null; savedJSON = ""; changes = [];
    location.hash = "";
    location.reload();
  };

  $("#publishBtn").onclick = publish;
  $("#discardBtn").onclick = discard;
  $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
  // Ctrl+S = Xuất bản
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!$("#edForm")) publish(); else $("#edForm").requestSubmit(); }
  });

  if (IS_LOCAL) {
    conn = { owner: "local", repo: "", branch: "" };
    startApp();
  } else {
    conn = readConn();
    if (conn && conn.token) startApp();
    else showLogin();
  }
})();
