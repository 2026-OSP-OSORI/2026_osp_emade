class AppError(Exception):
    # service에서 실패를 알릴 때 던지는 공통 에러
    #details 추가 11/21다인 
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details