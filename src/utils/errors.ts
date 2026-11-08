export type ErrorCode =
  | 'ERR_AGY_NOT_FOUND'
  | 'ERR_INVALID_HOME_NAME'
  | 'ERR_HOME_NOT_FOUND'
  | 'ERR_REMOVE_NEEDS_CONFIRM';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ERR_AGY_NOT_FOUND: "`agy` không tìm thấy trong PATH. Cài đặt `agy` và đảm bảo nó có trong PATH.",
  ERR_INVALID_HOME_NAME: "Tên '{name}' không hợp lệ. Chỉ dùng chữ, số, '-' và '_' (tối đa 32 ký tự, bắt đầu bằng chữ hoặc số).",
  ERR_HOME_NOT_FOUND: "Profile '{name}' không tồn tại. Chạy `agyw list` để xem danh sách, hoặc `agyw exec {name}` để tạo mới.",
  ERR_REMOVE_NEEDS_CONFIRM: "Xóa profile '{name}' sẽ xóa luôn đăng nhập và lịch sử hội thoại của nó. Chạy lại với `--yes` để xác nhận.",
};

export class AgywError extends Error {
  readonly code: ErrorCode;
  readonly exitCode = 1;

  constructor(code: ErrorCode, context?: Record<string, string>) {
    let message = ERROR_MESSAGES[code];
    if (context) {
      for (const [key, val] of Object.entries(context)) {
        message = message.replaceAll(`{${key}}`, val);
      }
    }
    super(message);
    this.code = code;
    this.name = 'AgywError';
  }
}
