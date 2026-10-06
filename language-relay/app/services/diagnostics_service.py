"""Safe local reports; probes never exchange tokens or invoke a model."""
import asyncio
import json
import re
import sys
import time

import httpx2

from app.config import PROJECT_ROOT
from app.errors import RelayError
from app.services.chatgpt_auth import DISCOVERY, ISSUER, JWKS, RESOURCE
from diagnose import (
    atomic_json,
    auth_snapshot,
    clean_operations,
    environment_snapshot,
    http_evidence,
    local_snapshot,
    make_report,
    mapping,
    network_error,
    read_json,
)


class DiagnosticsService:
    def __init__(self, config, auth, version):
        self.config = config
        self.auth = auth
        self.version = version
        self.path = config.data_dir / "diagnostics-latest.json"
        self.lock = asyncio.Lock()

    async def probe(self, stage, url, token=None):
        started = time.monotonic()
        try:
            async with self.auth.factory() as client:
                response = await client.get(url, timeout=4, headers={"Authorization": "Bearer " + token} if token else {})
            evidence = http_evidence(response.status_code, response.headers, response.content)
            ok = response.status_code == 200 and evidence["body_shape"] == "json_object"
            count = None
            if ok:
                body = response.json()
                if stage == "auth_discovery":
                    ok = body.get("issuer") == ISSUER and body.get("jwks_uri") == JWKS
                elif stage == "auth_jwks":
                    ok = isinstance(body.get("keys"), list) and bool(body["keys"])
                else:
                    ok = isinstance(body.get("models"), list)
                    if ok:
                        count = sum(isinstance(item, dict) and item.get("visibility") == "list" for item in body["models"])
            return {"stage": stage, "outcome": "ok" if ok else "error", "duration_ms": round((time.monotonic() - started) * 1000), **evidence, **({"visible_models_count": count} if count is not None else {})}
        except (httpx2.HTTPError, ValueError, TypeError):
            return {"stage": stage, "outcome": "error", "code": network_error(sys.exception()), "duration_ms": round((time.monotonic() - started) * 1000)}

    async def run(self, check_network, port, settings):
        if self.lock.locked():
            raise RelayError("diagnostic_busy", "自检正在运行，请等待完成后再导出。", 409)
        async with self.lock:
            probes = []
            if check_network:
                try:
                    data = self.auth.read()
                except RelayError:
                    data = {}
                tasks = [self.probe("auth_discovery", DISCOVERY), self.probe("auth_jwks", JWKS)]
                # Use only an existing unexpired grant. A diagnostic never rotates
                # tokens, repeats OAuth, switches billing, or changes model settings.
                token = data.get("access_token")
                if token and "chatgpt.tokens.use.direct" in data.get("scopes", []) and isinstance(data.get("expires_at"), (int, float)) and data["expires_at"] > time.time():
                    tasks.append(self.probe("model_permission", RESOURCE + "/models", token))
                else:
                    probes.append({"stage": "model_permission", "outcome": "skipped"})
                try:
                    async with asyncio.timeout(6):
                        probes = [*await asyncio.gather(*tasks), *probes]
                except TimeoutError:
                    probes = [{"stage": "auth_discovery", "outcome": "error", "code": "network_timeout"}]
            local = local_snapshot(self.config.data_dir)
            local.update(server_reachable=True, legacy_app=False)
            try:
                data = self.auth.read()
                local["auth_record_unreadable"] = False
            except RelayError:
                data = {}
                local["auth_record_unreadable"] = True
            snapshot = auth_snapshot(data, self.auth.status(settings.chatgpt_model))
            snapshot.update(selected_provider=settings.provider, api_key_configured=settings.openai_api_key_set)
            operations = [*clean_operations(read_json(PROJECT_ROOT / ".data" / "operation-results.json")), *clean_operations(read_json(self.config.data_dir / "operation-results.json"))]
            report = make_report(app_version=self.version, environment=environment_snapshot(), local=local, auth=snapshot, trace=self.auth.trace.snapshot(), probes=probes, network_requested=check_network, server_port=port, operations=operations)
            try:
                atomic_json(self.path, report)
            except OSError:
                raise RelayError("diagnostic_write_failed", "自检已完成，但报告无法保存在本机。请检查数据目录权限或运行独立诊断脚本。", 500) from None
            return report

    def export(self):
        data = read_json(self.path)
        if not isinstance(data, dict) or data.get("application") != "language-relay":
            raise RelayError("diagnostic_missing", "尚无自检报告，请先点击一键自检并导出。", 404)
        # Never blindly serve a disk file, even one the app originally created.
        network = mapping(data.get("network"))
        report = make_report(app_version=data.get("app_version"), environment=data.get("environment", {}), local=data.get("local", {}), auth=data.get("authorization", {}), trace=data.get("login_trace", {}), probes=network.get("probes", []), network_requested=network.get("requested") is True, server_port=data.get("server_port"), operations=data.get("operations", []))
        if isinstance(data.get("report_id"), str) and re.fullmatch(r"[0-9a-f]{32}", data["report_id"]):
            report["report_id"] = data["report_id"]
        if isinstance(data.get("created_at"), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00", data["created_at"]):
            report["created_at"] = data["created_at"]
        return json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8") + b"\n"
