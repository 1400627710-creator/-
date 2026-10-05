class RelayError(Exception):
    """Safe, Chinese error suitable for the browser. Never holds provider bodies."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 502,
        *,
        retryable: bool = False,
        attempts: int = 0,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.attempts = attempts

    def detail(self) -> dict:
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
            "attempts": self.attempts,
        }
