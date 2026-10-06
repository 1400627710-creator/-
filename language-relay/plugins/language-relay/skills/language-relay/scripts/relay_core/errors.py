class ReplyFormatError(ValueError):
    def __init__(self, message, *, issues=()):
        super().__init__(message)
        self.issues = issues


class PluginError(Exception):
    def __init__(
        self,
        code,
        stage,
        message,
        next_step="根据错误阶段修正后重试。",
        *,
        issues=None,
        remaining_retries=None,
    ):
        self.code, self.stage, self.message, self.next_step = (
            code,
            stage,
            message,
            next_step,
        )
        self.issues, self.remaining_retries = issues, remaining_retries

    def detail(self):
        value = {
            "ok": False,
            "error_code": self.code,
            "problem_stage": self.stage,
            "message": self.message,
            "next_step": self.next_step,
        }
        if self.issues is not None:
            value.update(issues=self.issues, remaining_retries=self.remaining_retries)
        return value
