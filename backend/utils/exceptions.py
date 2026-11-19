class AppError(Exception):
    # service에서 실패를 알릴 때 던지는 공통 에러
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message