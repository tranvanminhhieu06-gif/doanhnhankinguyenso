# Doanh Nhân Kỷ Nguyên Số

Trang tin tức kinh doanh: câu chuyện khởi nghiệp, xây dựng thương hiệu, kiến thức kinh doanh cho doanh nhân thời đại số.

Web tĩnh viết bằng HTML/CSS/JS thuần, không cần build. Chạy trên GitHub Pages.

## Trang quản trị

Địa chỉ: **`/admin/`** (ví dụ https://tranvanminhhieu06-gif.github.io/doanhnhankinguyenso/admin/)

Quản lý được:
- **Bài viết**: viết mới, sửa, xoá, lưu nháp, chọn danh mục, ảnh đại diện, nội dung có định dạng.
- **Banner**: thêm / đổi / xoá / sắp xếp ảnh trượt, link khi bấm, thời gian mỗi ảnh.
- **Danh mục**: thêm, đổi tên, xoá, sắp xếp, chọn hiện trên menu và dải "Chủ đề nổi bật".
- **Cài đặt trang**: tên trang, khẩu hiệu, câu giới thiệu, tác giả mặc định, logo.

Cách hoạt động: mọi nội dung nằm trong `data/content.json`. Trang quản trị sửa file này rồi bấm
**Xuất bản** để lưu thẳng vào GitHub; GitHub Pages tự cập nhật web sau khoảng 1–2 phút.
Ảnh tải lên được nén sang WebP và lưu trong `images/uploads/`.

### Đăng nhập lần đầu

Cần một **mã truy cập GitHub (fine-grained token)**:
1. Vào https://github.com/settings/personal-access-tokens/new
2. *Repository access* → *Only select repositories* → chọn repo `doanhnhankinguyenso`.
3. *Repository permissions* → **Contents: Read and write**.
4. Tạo token, dán vào trang quản trị.

Không chia sẻ mã này cho người khác. Mất máy hoặc lộ mã thì vào trang token của GitHub để xoá (Revoke).

## Chạy thử trên máy

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

- Web: http://localhost:8080
- Quản trị: http://localhost:8080/admin/ — không cần token, bấm Xuất bản sẽ lưu thẳng vào file trên máy.
  Sau đó `git add -A`, `git commit`, `git push` để đưa lên web thật.

## Cấu trúc

| File | Nội dung |
|---|---|
| `index.html` | Khung trang web |
| `css/style.css` | Giao diện web |
| `js/main.js` | Hiển thị nội dung, slider banner, chuyển trang |
| `js/markdown.js` | Chuyển nội dung bài (Markdown) sang HTML |
| `data/content.json` | **Toàn bộ nội dung**: cài đặt, banner, danh mục, bài viết |
| `admin/` | Trang quản trị |
| `images/` | Ảnh dùng trên trang (`images/uploads/` là ảnh tải lên từ trang quản trị) |
| `serve.ps1` | Server chạy thử trên máy Windows |

## Còn thiếu

- **Form liên hệ** chưa gửi tin nhắn đi đâu — sửa hàm `sendContact` trong `js/main.js`.
