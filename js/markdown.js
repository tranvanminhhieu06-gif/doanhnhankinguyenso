// Bộ chuyển Markdown đơn giản → HTML (dùng chung cho trang chính và trang quản trị).
// Hỗ trợ: ## tiêu đề, ### tiêu đề nhỏ, **đậm**, *nghiêng*, [chữ](link), ![mô tả](ảnh),
// danh sách "- " hoặc "1. ", trích dẫn "> ", đường kẻ "---", đoạn văn cách nhau bằng dòng trống.
(function (global) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Chỉ cho phép link http(s), mailto, đường dẫn tương đối, # — chặn javascript: …
  const safeUrl = (u) => (/^(https?:\/\/|mailto:|\/|\.{0,2}\/|#|[\w-]+\/)/i.test(u.trim()) && !/^\s*javascript:/i.test(u) ? u.trim() : "#");

  const inline = (s) =>
    esc(s)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${safeUrl(src.replace(/&amp;/g, "&"))}" alt="${alt}" loading="lazy">`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
        const u = safeUrl(href.replace(/&amp;/g, "&"));
        const ext = /^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : "";
        return `<a href="${esc(u)}"${ext}>${t}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  function markdown(src) {
    const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let para = [], list = null;
    const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; } };

    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushPara(); flushList(); continue; }
      if ((m = line.match(/^(#{2,4})\s+(.*)$/))) { flushPara(); flushList(); const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
      if (/^-{3,}$/.test(line.trim())) { flushPara(); flushList(); out.push("<hr>"); continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        const tag = /^\s*\d/.test(line) ? "ol" : "ul";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[1]);
        continue;
      }
      if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) { flushPara(); flushList(); out.push(`<figure>${inline(line)}${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ""}</figure>`); continue; }
      flushList();
      para.push(line.trim());
    }
    flushPara(); flushList();
    return out.join("\n");
  }

  global.markdown = markdown;
})(window);
