// Dữ liệu bài viết (thay bằng API / CMS khi cần)
const UP = "https://doanhnhankynguyenso.com/wp-content/uploads/";

const SITE = {
  name: "Doanh Nhân Kỷ Nguyên Số",
  tagline: "Cập nhật tin tức kinh doanh",
  intro: "Câu chuyện khởi nghiệp và bài học thương hiệu cho doanh nhân thời đại số.",
  author: "Ban biên tập",
  logo: UP + "2026/08/cropped-cropped-cropped-cropped-cropped-doanh-nha%CC%82n-ki%CC%89-nguye%CC%82n-so%CC%82%CC%81-1-1-1.png",
  // Ảnh banner trượt ở đầu trang (khổ 1781×687). Thêm/bớt/đổi ảnh tại đây; link có thể để "" nếu không cần.
  // Tạm thời 3 slide dùng chung một ảnh — thay đường dẫn img khi có ảnh mới.
  banners: [
    { img: "images/banner.webp", alt: "Doanh nhân kỷ nguyên số – M&T Group: Giải pháp marketing toàn diện cho doanh nghiệp", link: "https://mtgeco.com" },
    { img: "images/banner.webp", alt: "Doanh nhân kỷ nguyên số – M&T Group: Giải pháp marketing toàn diện cho doanh nghiệp", link: "https://mtgeco.com" },
    { img: "images/banner.webp", alt: "Doanh nhân kỷ nguyên số – M&T Group: Giải pháp marketing toàn diện cho doanh nghiệp", link: "https://mtgeco.com" },
  ],
  // true = ảnh banner đã có sẵn logo + tên trang → ẩn lớp logo chồng lên (vẫn giữ cho trình đọc màn hình)
  bannerHasLogo: true,
  bannerDelay: 5000, // ms giữa 2 lần trượt
};

const CATEGORIES = [
  { slug: "khoi-nghiep", name: "Câu chuyện khởi nghiệp" },
  { slug: "thuong-hieu", name: "Xây dựng thương hiệu" },
  { slug: "suc-khoe", name: "Sức khỏe" },
  { slug: "kinh-doanh", name: "Kinh doanh" },
  { slug: "chia-se", name: "Góc chia sẻ" },
  { slug: "tin-tuc", name: "Tin tức" },
];

// Chủ đề nổi bật: trỏ tới danh mục tương ứng
const TAGS = ["thuong-hieu", "khoi-nghiep", "kinh-doanh", "suc-khoe", "chia-se"];

// Ghi chú dữ liệu bài viết:
// - date: định dạng gốc mm/dd/yyyy, hiển thị ra dd/mm/yyyy
// - comments (tuỳ chọn): số bình luận, chỉ hiện khi > 0
// - minutes (tuỳ chọn): thời gian đọc, chỉ hiện khi có

const POSTS = [
  {
    id: "khi-nao-nen-bo-cuoc-trong-khoi-nghiep",
    title: "Khi nào nên bỏ cuộc trong khởi nghiệp? Bài toán khó mà doanh nhân phải đối mặt",
    cats: ["khoi-nghiep"], date: "09/29/2026", views: 1240,
    img: UP + "2026/09/chinh-phu-phe-duyet-de-an-ho-tro-2000-doanh-nghiep-khoi-nghiep-sang-tao-0021.jpg",
    excerpt: "Khi nào nên bỏ cuộc trong khởi nghiệp? Đây là một trong những câu hỏi khó nhất mà một doanh nhân phải đối mặt. Bởi trong kinh doanh, kiên trì…",
  },
  {
    id: "doanh-nhan-tre-khoi-nghiep-thoi-ai",
    title: "Doanh nhân trẻ khởi nghiệp trong thời đại AI: Cơ hội nằm ở đâu?",
    cats: ["khoi-nghiep"], date: "09/29/2026", views: 2310,
    img: UP + "2026/09/ec80a8b79b1e41f4b535af66c4172060-63381.jpg",
    excerpt: "Doanh nhân trẻ khởi nghiệp trong thời đại AI đang đứng trước một bối cảnh rất khác so với những thế hệ doanh nhân đi trước. Nếu trước đây một…",
  },
  {
    id: "y-tuong-khoi-nghiep",
    title: "Từ ý tưởng đến doanh nghiệp: 7 bước biến một ý tưởng kinh doanh thành sản phẩm thực tế",
    cats: ["khoi-nghiep"], date: "09/26/2026", views: 980,
    img: UP + "2026/09/ytuongkinhdoanh7_1741859391509.jpg",
    excerpt: "Từ ý tưởng đến doanh nghiệp là một hành trình dài hơn nhiều so với việc nghĩ ra một sản phẩm hay tìm được một ý tưởng kinh doanh thú…",
  },
  {
    id: "co-che-nao-bo-ghi-nho-thuong-hieu",
    title: "Cơ chế não bộ ghi nhớ hệ thống nhận diện thương hiệu của doanh nghiệp",
    cats: ["thuong-hieu"], date: "09/25/2026", views: 1530,
    img: UP + "2026/09/nl.jpg",
    excerpt: "Cơ chế não bộ ghi nhớ hệ thống nhận diện thương hiệu của doanh nghiệp không đơn giản là việc khách hàng nhìn thấy một logo nhiều lần rồi tự…",
  },
  {
    id: "that-bai-khi-khoi-nghiep",
    title: "Thất bại khi khởi nghiệp: Vì sao nhiều doanh nhân phải đi qua thất bại trước khi thành công?",
    cats: ["khoi-nghiep"], date: "09/25/2026", views: 1720,
    img: UP + "2026/09/3222_photo-2-15686461553551514523390.jpg",
    excerpt: "Thất bại khi khởi nghiệp là một trong những trải nghiệm phổ biến nhất nhưng cũng ít được nói đến một cách đầy đủ trong câu chuyện kinh doanh. Trên…",
  },
  {
    id: "khoi-nghiep-tu-con-so-0",
    title: "Khởi nghiệp từ con số 0: Doanh nhân bắt đầu như thế nào khi không có nhiều vốn?",
    cats: ["khoi-nghiep"], date: "09/23/2026", views: 2050,
    img: UP + "2026/09/khoi-nghiep-1-1.jpg",
    excerpt: "Khởi nghiệp từ con số 0 nghe có vẻ giống một câu chuyện truyền cảm hứng. Nhưng nếu nhìn từ góc độ kinh doanh, đây trước hết là một bài…",
  },
  {
    id: "thuong-hieu-la-gi",
    title: "Thương hiệu là gì? Từ căn bản của thương hiệu đến tầm quan trọng đối với doanh nghiệp",
    cats: ["chia-se"], date: "09/12/2026", views: 3100,
    img: UP + "2026/09/2021-02-02t233203z2146242536rc2nkl96orlnrtrmadp3amazon-com-resultsqgkr-16124243607021957020706.jpg",
    excerpt: "Thương hiệu là gì? Đây là câu hỏi tưởng như rất cơ bản nhưng không ít doanh nghiệp vẫn trả lời chưa thật sự rõ ràng. Có người cho rằng…",
  },
  {
    id: "thuong-hieu-vinamilk",
    title: "Thương hiệu Vinamilk: Hành trình xây dựng thương hiệu sữa Việt qua gần 50 năm",
    cats: ["khoi-nghiep", "thuong-hieu"], date: "09/12/2026", views: 2890,
    img: UP + "2026/09/sua-vinamilk-2.jpg",
    excerpt: "Thương hiệu Vinamilk là một trong những câu chuyện tiêu biểu về quá trình xây dựng và phát triển thương hiệu Việt. Từ một doanh nghiệp được hình thành trong…",
  },
  {
    id: "hanh-trinh-facebook",
    title: "Hành trình tạo nên nền tảng Facebook: Từ dự án sinh viên đến mạng xã hội toàn cầu",
    cats: ["khoi-nghiep", "thuong-hieu"], date: "09/12/2026", views: 1990,
    img: UP + "2026/08/c40c580c-0996-11e8-accd-2e995a9a3302.jpg",
    excerpt: "Hành trình tạo nên nền tảng Facebook bắt đầu từ một dự án công nghệ trong khuôn viên Đại học Harvard vào năm 2004. Từ một website dành cho sinh…",
  },
  {
    id: "shopee",
    title: "Shopee: Từ sàn thương mại điện tử non trẻ đến đế chế mua sắm số Đông Nam Á",
    cats: ["khoi-nghiep", "thuong-hieu"], date: "09/11/2026", views: 1650,
    img: UP + "2026/08/20120326132317_1_01bf2.jpg",
    excerpt: "Sự hình thành và phát triển nổi bật của Shopee là một câu chuyện đáng chú ý trong hành trình bùng nổ của thương mại điện tử tại châu Á.…",
  },
  {
    id: "sinh-vien-khoi-nghiep",
    title: "Sinh viên khởi nghiệp: Những điều cần chuẩn bị trước khi bắt đầu",
    cats: ["kinh-doanh"], date: "08/28/2026", views: 870,
    img: UP + "2026/08/sinh-vien-khoi-nghiep.jpg",
    excerpt: "Sinh viên khởi nghiệp ngày càng phổ biến, nhưng để đi đường dài cần chuẩn bị kỹ về kiến thức, tài chính và mạng lưới quan hệ…",
  },
  {
    id: "crm-cong-nghe",
    title: "Ứng dụng CRM giúp doanh nghiệp nhỏ quản lý khách hàng hiệu quả",
    cats: ["kinh-doanh"], date: "08/25/2026", views: 760,
    img: UP + "2026/08/crm-cong-nghe_1516674027-1501.jpg",
    excerpt: "CRM không còn là công cụ dành riêng cho tập đoàn lớn. Doanh nghiệp nhỏ hoàn toàn có thể tận dụng để chăm sóc khách hàng tốt hơn…",
  },
  {
    id: "cach-mang-cong-nghiep-4-0",
    title: "Cách mạng công nghiệp 4.0 và cơ hội cho doanh nhân Việt",
    cats: ["tin-tuc", "kinh-doanh"], date: "08/20/2026", views: 1110,
    img: UP + "2026/08/cach-mang-cong-nghiep-4-0.jpg",
    excerpt: "Cách mạng công nghiệp 4.0 mở ra nhiều cơ hội chuyển đổi số cho doanh nghiệp Việt Nam, từ sản xuất đến bán lẻ…",
  },
  {
    id: "giam-can-cho-nguoi-ban-ron",
    title: "Giảm cân khoa học cho doanh nhân bận rộn",
    cats: ["suc-khoe"], date: "08/18/2026", views: 1430,
    img: UP + "2026/08/Giamcan-600x400.jpg",
    excerpt: "Lịch làm việc dày đặc khiến nhiều doanh nhân bỏ quên sức khỏe. Một vài thói quen nhỏ có thể giúp kiểm soát cân nặng hiệu quả…",
  },
  {
    id: "suc-khoe-doanh-nhan",
    title: "Giữ gìn sức khỏe – nền tảng của mọi thành công",
    cats: ["suc-khoe"], date: "08/15/2026", views: 690,
    img: UP + "2026/08/1-21-scaled-1-600x400.jpg",
    excerpt: "Sức khỏe là tài sản quý giá nhất của mỗi doanh nhân. Không có sức khỏe, mọi kế hoạch kinh doanh đều khó thực hiện…",
  },
];

const catName = (slug) => (CATEGORIES.find((c) => c.slug === slug) || {}).name || slug;
