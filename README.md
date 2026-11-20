# Doanh Nhân Kỷ Nguyên Số

Trang tin tức kinh doanh: câu chuyện khởi nghiệp, xây dựng thương hiệu, kiến thức kinh doanh cho doanh nhân thời đại số.

Web tĩnh viết bằng HTML/CSS/JS thuần, không cần build.

## Cấu trúc

| File | Nội dung |
|---|---|
| `index.html` | Khung trang |
| `css/style.css` | Giao diện |
| `js/data.js` | Dữ liệu: ảnh banner, danh mục, bài viết |
| `js/main.js` | Hiển thị nội dung, slider banner, chuyển trang |
| `images/` | Ảnh dùng trên trang |
| `serve.ps1` | Server chạy thử trên máy Windows |

## Chạy thử trên máy

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Rồi mở http://localhost:8080

## Sửa nội dung thường gặp

- **Đổi ảnh banner:** chép ảnh vào `images/`, sửa mục `banners` trong `js/data.js`.
- **Thêm bài viết:** thêm một mục vào `POSTS` trong `js/data.js`.
- **Form liên hệ:** chưa nối nơi nhận — sửa hàm `sendContact` trong `js/main.js`.
