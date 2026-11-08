export type ErrorCode =
  | 'ERR_PROFILE_NOT_FOUND'
  | 'ERR_PROFILE_EXISTS'
  | 'ERR_REMOVE_ACTIVE'
  | 'ERR_REMOVE_LAST'
  | 'ERR_AMBIGUOUS_PROFILE'
  | 'ERR_NO_PROFILES'
  | 'ERR_AGY_NOT_FOUND'
  | 'ERR_ANTIGRAVITY_NOT_INIT'
  | 'ERR_CONCURRENT_SWITCH'
  | 'ERR_ANTIGRAVITY_RUNNING'
  | 'ERR_ENV_WRITE_FAILED'
  | 'ERR_INVALID_HOME_NAME';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ERR_PROFILE_NOT_FOUND: "Profile '{name}' không tồn tại. Chạy `agyw profile list` để xem danh sách.",
  ERR_PROFILE_EXISTS: "Profile '{name}' đã tồn tại. Dùng `agyw profile list` để xem.",
  ERR_REMOVE_ACTIVE: "Không thể xóa profile đang active. Switch sang profile khác trước: `agyw switch <other>`.",
  ERR_REMOVE_LAST: "Không thể xóa profile cuối cùng. Cần ít nhất 1 profile.",
  ERR_AMBIGUOUS_PROFILE: "Prefix '{name}' khớp nhiều profile: {matches}. Hãy nhập tên đầy đủ.",
  ERR_NO_PROFILES: "Chưa có profile nào. Chạy `agyw init` để bắt đầu.",
  ERR_AGY_NOT_FOUND: "`agy` không tìm thấy trong PATH. Cài đặt `agy` và đảm bảo nó có trong PATH.",
  ERR_ANTIGRAVITY_NOT_INIT: "Thư mục `~/.gemini/antigravity-cli/` chưa tồn tại. Chạy `agy` lần đầu để khởi tạo.",
  ERR_CONCURRENT_SWITCH: "Đang có switch operation khác đang chạy. Thử lại sau. Lock tự xóa sau 30 giây.",
  ERR_ANTIGRAVITY_RUNNING: "Antigravity/agy đang chạy ({detail}). Tiến trình này giữ token trong RAM và ghi đè ngược lại keychain, làm switch vô hiệu và lẫn token giữa các profile. Hãy thoát hẳn Antigravity (Cmd+Q) và đóng mọi tiến trình `agy`, rồi switch lại.",
  ERR_ENV_WRITE_FAILED: "Không thể ghi vào `~/.gemini/antigravity-cli/`: {detail}. Kiểm tra quyền truy cập thư mục.",
  ERR_INVALID_HOME_NAME: "Tên '{name}' không hợp lệ. Chỉ dùng chữ, số, '-' và '_' (tối đa 32 ký tự, bắt đầu bằng chữ hoặc số).",
};

export class AgywError extends Error {
  readonly code: ErrorCode;
  readonly exitCode = 1;

  constructor(code: ErrorCode, context?: Record<string, string>) {
    let message = ERROR_MESSAGES[code];
    if (context) {
      for (const [key, val] of Object.entries(context)) {
        message = message.replace(`{${key}}`, val);
      }
    }
    super(message);
    this.code = code;
    this.name = 'AgywError';
  }
}
