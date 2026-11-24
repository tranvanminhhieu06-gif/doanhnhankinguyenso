(async () => {
  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  const PER_PAGE = 5;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- Tải dữ liệu (do trang quản trị /admin chỉnh sửa) ---------- */
  let DATA;
  try {
    // ?v= để tránh trình duyệt/CDN giữ bản cũ sau khi vừa xuất bản
    const r = await fetch(`data/content.json?v=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
  } catch (e) {
    view.innerHTML = `<div class="box empty" style="margin:30px 0">Chưa tải được nội dung trang. Vui lòng tải lại sau ít phút.</div>`;
    console.error("Không tải được data/content.json", e);
    return;
  }
  const SITE = DATA.site || {};
  const CATEGORIES = DATA.categories || [];
  const TAGS = DATA.tags || [];
  // Chỉ hiện bài đã xuất bản, mới nhất lên đầu
  const POSTS = (DATA.posts || [])
    .filter((p) => p.status !== "draft")
    .map((p) => ({ cats: [], views: 0, ...p }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const catName = (slug) => (CATEGORIES.find((c) => c.slug === slug) || {}).name || slug;

  const bg = (url) => `style="background-image:url('${esc(url).replace(/'/g, "%27")}')"`;
  const link = (p) => `#/bai-viet/${encodeURIComponent(p.id)}`;
  const cats = (p) => p.cats.map((c) => `<a class="cat" href="#/danh-muc/${esc(c)}">${esc(catName(c))}</a>`).join("");
  // Ngày lưu dạng yyyy-mm-dd → hiển thị dd/mm/yyyy
  const fmtDate = (s) => { const [y, m, d] = String(s).split("-"); return d ? `${d}/${m}/${y}` : esc(s); };
  const meta = (p) => `<div class="meta">
      <span><i class="fas fa-clock"></i>${fmtDate(p.date)}</span>
      ${p.minutes ? `<span><i class="fas fa-book-open"></i>${p.minutes} phút đọc</span>` : ""}
      <span><i class="fas fa-user-circle"></i>${esc(p.author || SITE.author)}</span>
      ${p.comments > 0 ? `<span><i class="fas fa-comments"></i>${p.comments} bình luận</span>` : ""}
    </div>`;

  /* ---------- Phần cố định ---------- */
  $("#logo").src = SITE.logo;
  $("#siteName").textContent = SITE.name;
  $("#siteTag").textContent = SITE.tagline;
  $("#siteIntro").textContent = SITE.intro;
  $("#year").textContent = new Date().getFullYear();

  /* ---------- Slider banner: tự trượt sang trái, lặp vô hạn ---------- */
  (() => {
    const list = SITE.banners || [];
    const track = $("#slides"), dots = $("#slideDots");
    $("#siteHeader").classList.toggle("has-logo", !!SITE.bannerHasLogo);
    const slideHTML = (b) => {
      const img = `<img src="${esc(b.img)}" alt="${esc(b.alt)}" draggable="false">`;
      return b.link ? `<a class="slide" href="${esc(b.link)}" target="_blank" rel="noopener">${img}</a>` : `<div class="slide">${img}</div>`;
    };
    // Thêm bản sao ảnh đầu ở cuối để trượt tiếp sang trái liền mạch
    track.innerHTML = list.map(slideHTML).join("") + (list.length > 1 ? slideHTML(list[0]) : "");
    if (list.length < 2) { $("#slidePrev").hidden = $("#slideNext").hidden = true; return; }
    dots.innerHTML = list.map((_, i) => `<button aria-label="Ảnh ${i + 1}"></button>`).join("");

    let i = 0, timer;
    const go = (n, anim = true) => {
      track.classList.toggle("no-anim", !anim);
      i = n;
      track.style.transform = `translateX(-${i * 100}%)`;
      [...dots.children].forEach((d, k) => d.classList.toggle("active", k === i % list.length));
    };
    track.addEventListener("transitionend", () => {
      if (i === list.length) go(0, false); // tới bản sao → nhảy về ảnh đầu không hiệu ứng
    });
    const next = () => { if (i === list.length) go(0, false); requestAnimationFrame(() => go(i + 1)); };
    const prev = () => {
      if (i === 0) { go(list.length, false); requestAnimationFrame(() => requestAnimationFrame(() => go(list.length - 1))); }
      else go(i - 1);
    };
    const start = () => { clearInterval(timer); timer = setInterval(next, SITE.bannerDelay || 5000); };
    const stop = () => clearInterval(timer);

    $("#slideNext").onclick = () => { next(); start(); };
    $("#slidePrev").onclick = () => { prev(); start(); };
    [...dots.children].forEach((d, k) => (d.onclick = () => { go(k); start(); }));
    const header = $("#siteHeader");
    header.addEventListener("mouseenter", stop);
    header.addEventListener("mouseleave", start);
    // Vuốt trên điện thoại
    let x0 = null;
    header.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    header.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
      x0 = null; start();
    });
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    go(0, false);
    start();
  })();

  $("#menu").innerHTML =
    CATEGORIES.filter((c) => c.inMenu !== false).map((c) => `<li><a href="#/danh-muc/${esc(c.slug)}">${esc(c.name)}</a></li>`).join("") +
    `<li><a href="#/lien-he">Liên hệ</a></li>`;
  $("#tags").innerHTML = TAGS.map((s) => `<a href="#/danh-muc/${esc(s)}">${esc(catName(s))}</a>`).join("");
  const tick = POSTS.slice(0, 6).map((p) => `<a href="${link(p)}"><i class="fas fa-arrow-circle-right"></i>${esc(p.title)}</a>`).join("");
  $("#ticker").innerHTML = tick + tick;
  $("#footCats").innerHTML = CATEGORIES.map((c) => `<li><a href="#/danh-muc/${esc(c.slug)}">${esc(c.name)}</a></li>`).join("");
  $("#footPosts").innerHTML = POSTS.slice(0, 5).map((p) => `<li><a href="${link(p)}">${esc(p.title)}</a></li>`).join("");

  // Đồng hồ
  const DAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
  const pad = (n) => String(n).padStart(2, "0");
  const tickClock = () => {
    const d = new Date();
    $("#today").textContent = `${DAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    $("#clock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  tickClock(); setInterval(tickClock, 1000);

  // Menu mobile, tìm kiếm, lên đầu trang
  $("#navToggle").onclick = () => $("#menu").classList.toggle("open");
  $("#searchBtn").onclick = () => { $("#searchbar").classList.toggle("open"); $("#searchInput").focus(); };
  $("#searchbar").onsubmit = (e) => {
    e.preventDefault();
    const q = $("#searchInput").value.trim();
    if (q) location.hash = `#/tim-kiem/${encodeURIComponent(q)}`;
  };
  const totop = $("#totop");
  addEventListener("scroll", () => totop.classList.toggle("show", scrollY > 500));
  totop.onclick = () => scrollTo({ top: 0 });

  /* ---------- Khối giao diện ---------- */
  const postCard = (p) => `
    <article class="post-card box">
      <a href="${link(p)}" class="post-card__img" ${bg(p.img)}><span class="cam"><i class="fas fa-camera"></i></span></a>
      <div>
        ${cats(p)}
        <h3><a href="${link(p)}">${esc(p.title)}</a></h3>
        ${meta(p)}
        <p>${esc(p.excerpt)}</p>
        <a class="read-more" href="${link(p)}">Đọc tiếp <i class="fas fa-arrow-right"></i></a>
      </div>
    </article>`;

  const sidebar = () => {
    const counts = CATEGORIES.map((c) => ({ ...c, n: POSTS.filter((p) => p.cats.includes(c.slug)).length }));
    const hot = [...POSTS].sort((a, b) => b.views - a.views).slice(0, 3);
    return `
    <aside class="sidebar">
      <div class="widget box">
        <h3 class="section-title"><span>Tin nổi bật</span></h3>
        ${hot.length
          ? `<div class="hot">${hot.map((p) => `<a href="${link(p)}" ${bg(p.img)}><span>${esc(p.title)}</span></a>`).join("")}</div>`
          : `<p class="empty-note">Chưa có tin nổi bật. Xem các bài viết mới nhất bên dưới.</p>`}
      </div>
      <div class="widget box">
        <h3 class="section-title"><span>Bài viết mới</span></h3>
        <ul>${POSTS.slice(0, 5).map((p) => `<li><a href="${link(p)}">${esc(p.title)}</a></li>`).join("")}</ul>
      </div>
      <div class="widget box">
        <h3 class="section-title"><span>Danh mục</span></h3>
        <ul>${counts.map((c) => `<li><a href="#/danh-muc/${esc(c.slug)}"><span>${esc(c.name)}</span><span class="count">${c.n}</span></a></li>`).join("")}</ul>
      </div>
    </aside>`;
  };

  const featured = () => {
    if (POSTS.length < 3) return "";
    const [a, b, c] = POSTS;
    const tabItems = (list) => list.map((p) => `
      <li><a href="${link(p)}" class="thumb" ${bg(p.img)}></a>
        <div>${cats(p)}<h4><a href="${link(p)}">${esc(p.title)}</a></h4></div></li>`).join("");
    const lists = {
      latest: POSTS.slice(0, 4),
      popular: [...POSTS].sort((x, y) => y.views - x.views).slice(0, 4),
      trending: POSTS.slice(4, 8),
    };
    return `
    <section class="featured">
      <a href="${link(b)}" class="hero" ${bg(b.img)}>
        <span class="hero__icon"><i class="fas fa-camera"></i></span>
        <div class="hero__body">${b.cats.map((x) => `<span class="cat">${esc(catName(x))}</span>`).join("")}<h2>${esc(b.title)}</h2>${meta(b)}</div>
      </a>
      <div class="stack">
        ${[a, c].map((p) => `
        <div class="mini box">
          <a href="${link(p)}" class="mini__img" ${bg(p.img)}>${p.cats.map((x) => `<span class="cat">${esc(catName(x))}</span>`).join("")}</a>
          <h3><a href="${link(p)}">${esc(p.title)}</a></h3>${meta(p)}
        </div>`).join("")}
      </div>
      <div class="tabs box">
        <div class="tabs__head">
          <button data-tab="latest" class="active"><i class="far fa-clock"></i> Mới nhất</button>
          <button data-tab="popular"><i class="fas fa-fire"></i> Đọc nhiều</button>
          <button data-tab="trending" class="full"><i class="fas fa-bolt"></i> Đang được quan tâm</button>
        </div>
        <ul class="tabs__list" id="tabList">${tabItems(lists.latest)}</ul>
      </div>
    </section>`;
  };

  const bindTabs = () => {
    const lists = {
      latest: POSTS.slice(0, 4),
      popular: [...POSTS].sort((x, y) => y.views - x.views).slice(0, 4),
      trending: POSTS.slice(4, 8),
    };
    document.querySelectorAll(".tabs__head button").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll(".tabs__head button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        $("#tabList").innerHTML = lists[btn.dataset.tab].map((p) => `
          <li><a href="${link(p)}" class="thumb" ${bg(p.img)}></a>
            <div>${cats(p)}<h4><a href="${link(p)}">${esc(p.title)}</a></h4></div></li>`).join("");
      };
    });
  };

  const listing = (list, page, base, title = "", emptyMsg = "Chưa có bài viết trong mục này. Xem các bài viết mới nhất ở trang chủ.") => {
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    page = Math.min(Math.max(1, page), pages);
    const items = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const pager = pages > 1
      ? `<div class="pagination">${Array.from({ length: pages }, (_, i) => `<button class="${i + 1 === page ? "active" : ""}" data-go="${base}/trang/${i + 1}">${i + 1}</button>`).join("")}</div>`
      : "";
    return `
    <section class="layout">
      <div class="post-list">
        ${title ? `<h2 class="section-title"><span>${esc(title)}</span></h2>` : ""}
        ${items.length ? items.map(postCard).join("") : `<div class="box empty">${emptyMsg}</div>`}
        ${pager}
      </div>
      ${sidebar()}
    </section>`;
  };

  const single = (p) => {
    const related = POSTS.filter((x) => x.id !== p.id && x.cats.some((c) => p.cats.includes(c))).slice(0, 3);
    const url = encodeURIComponent(location.href);
    return `
    <div class="breadcrumb"><a href="#/">Trang chủ</a>${p.cats[0] ? ` / <a href="#/danh-muc/${esc(p.cats[0])}">${esc(catName(p.cats[0]))}</a>` : ""}</div>
    <section class="layout">
      <div class="post-list">
        <article class="single box">
          ${cats(p)}
          <h1>${esc(p.title)}</h1>
          ${meta(p)}
          ${p.img ? `<img class="cover" src="${esc(p.img)}" alt="${esc(p.title)}">` : ""}
          <div class="content">
            ${p.content && p.content.trim()
              ? markdown(p.content)
              : `<p><strong>${esc(String(p.excerpt || "").replace(/…$/, ""))}…</strong></p><p class="empty-note">Nội dung đầy đủ của bài viết đang được cập nhật.</p>`}
          </div>
          <div class="share">
            <a style="background:#1877f2" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${url}"><i class="fab fa-facebook-f"></i></a>
            <a style="background:#1da1f2" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${url}"><i class="fab fa-x-twitter"></i></a>
            <a style="background:#0a66c2" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${url}"><i class="fab fa-linkedin-in"></i></a>
          </div>
        </article>
        ${related.length ? `<h2 class="section-title"><span>Bài viết liên quan</span></h2>${related.map(postCard).join("")}` : ""}
      </div>
      ${sidebar()}
    </section>`;
  };

  const contact = () => `
    <section class="layout">
      <div class="contact box">
        <h2 class="section-title"><span>Liên hệ</span></h2>
        <p>Gửi câu chuyện khởi nghiệp, đề xuất hợp tác hoặc góp ý cho Doanh Nhân Kỷ Nguyên Số.</p>
        <form id="contactForm">
          <input required name="name" placeholder="Họ và tên">
          <input required name="email" type="email" placeholder="Email">
          <input name="subject" placeholder="Tiêu đề">
          <textarea required name="message" rows="6" placeholder="Nội dung"></textarea>
          <button class="btn" type="submit">Gửi tin nhắn</button>
          <p id="contactMsg" class="form-msg" hidden></p>
        </form>
      </div>
      ${sidebar()}
    </section>`;

  // Gửi form liên hệ. CHƯA nối backend: thay bằng fetch tới endpoint thật (Formspree, Google Apps Script, API riêng…)
  // ví dụ: const r = await fetch(URL, { method: "POST", body: JSON.stringify(data) }); if (!r.ok) throw new Error();
  const sendContact = async (data) => {
    console.info("[liên hệ] dữ liệu form (chưa gửi đi đâu):", data);
  };

  /* ---------- Router (hash) ---------- */
  const setActive = (hash) => {
    document.querySelectorAll(".mainnav__menu a").forEach((a) => a.classList.toggle("active", hash.startsWith(a.getAttribute("href"))));
    $(".mainnav__home").classList.toggle("active", hash === "#/" || hash === "" || hash.startsWith("#/trang"));
  };

  const render = () => {
    const hash = location.hash || "#/";
    const parts = hash.slice(2).split("/").filter(Boolean).map(decodeURIComponent);
    const pageIdx = parts.indexOf("trang");
    const page = pageIdx >= 0 ? parseInt(parts[pageIdx + 1], 10) || 1 : 1;
    let html;

    if (parts[0] === "bai-viet") {
      const p = POSTS.find((x) => x.id === parts[1]);
      html = p ? single(p) : `<div class="box empty" style="margin:30px 0">Bài viết không tồn tại. <a href="#/">Về trang chủ</a></div>`;
      document.title = p ? `${p.title} – ${SITE.name}` : SITE.name;
    } else if (parts[0] === "danh-muc") {
      const slug = parts[1];
      html = listing(POSTS.filter((p) => p.cats.includes(slug)), page, `#/danh-muc/${slug}`, catName(slug));
      document.title = `${catName(slug)} – ${SITE.name}`;
    } else if (parts[0] === "tim-kiem") {
      const q = (parts[1] || "").toLowerCase();
      const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
      const nq = norm(q);
      html = listing(
        POSTS.filter((p) => norm(p.title + " " + p.excerpt + " " + p.cats.map(catName).join(" ")).includes(nq)),
        page, `#/tim-kiem/${encodeURIComponent(q)}`, `Kết quả cho "${q}"`,
        `Không tìm thấy bài viết cho "${esc(q)}". Thử từ khóa ngắn hơn hoặc xem các <a href="#/danh-muc/khoi-nghiep">chủ đề nổi bật</a>.`
      );
      document.title = `Tìm kiếm – ${SITE.name}`;
    } else if (parts[0] === "lien-he") {
      html = contact();
      document.title = `Liên hệ – ${SITE.name}`;
    } else {
      html = (page === 1 ? featured() : "") + listing(POSTS, page, "#");
      document.title = SITE.name;
    }

    view.innerHTML = html;
    setActive(hash);
    bindTabs();
    $("#menu").classList.remove("open");
    view.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => (location.hash = b.dataset.go.replace(/^##/, "#"))));
    const cf = $("#contactForm");
    if (cf) cf.onsubmit = async (e) => {
      e.preventDefault();
      const msg = $("#contactMsg"), btn = cf.querySelector("button");
      btn.disabled = true; btn.textContent = "Đang gửi…";
      try {
        await sendContact(Object.fromEntries(new FormData(cf)));
        msg.className = "form-msg ok";
        msg.textContent = "Đã gửi! Chúng tôi sẽ phản hồi qua email trong 1–2 ngày làm việc.";
        cf.reset();
      } catch {
        msg.className = "form-msg err";
        msg.textContent = "Chưa gửi được tin nhắn do lỗi kết nối. Vui lòng thử lại sau ít phút.";
      }
      msg.hidden = false; btn.disabled = false; btn.textContent = "Gửi tin nhắn";
    };
    if (hash !== "#/" || window._rendered) scrollTo({ top: 0 });
    window._rendered = true;
  };

  addEventListener("hashchange", render);
  render();
})();
