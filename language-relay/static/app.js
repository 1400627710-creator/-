"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const state = { provider: "api", session: null, messages: [], selected: null, output: "", busy: false, action: null };
  const drafts = new Map();
  const pendingRequests = new Map();
  let toastTimer;
  let statusTimer;
  let loginTimer;
  let connectionBusy = false;
  let chatgptStatus = { connected: false, models: [] };
  let diagnosticReport = "";
  const loginReturned = new URLSearchParams(window.location.search).get("chatgpt_login") === "finished";

  function stored(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return true;
    } catch (_) { /* Storage can be disabled; SQLite remains authoritative. */ }
    return null;
  }

  function draftKey(session = state.session) {
    return session ? `relay-draft:${session.id}:${session.created_at}` : "relay-draft:new";
  }

  function pendingKey(session = state.session) { return `${draftKey(session)}:pending`; }

  function markPending(content) {
    const value = JSON.stringify({ content, after: state.messages.filter((m) => m.role === "user").at(-1)?.id || 0 });
    pendingRequests.set(pendingKey(), value);
    stored(pendingKey(), value);
  }

  function forgetPending(session = state.session) {
    pendingRequests.delete(pendingKey(session));
    stored(pendingKey(session), null);
  }

  function rememberDraft() {
    const key = draftKey();
    const value = $("idea-input").value;
    drafts.set(key, value);
    stored(key, value || null);
    updateCount();
  }

  function forgetDraft(session = state.session) {
    const key = draftKey(session);
    drafts.delete(key);
    stored(key, null);
  }

  function restoreDraft() {
    $("idea-input").value = drafts.get(draftKey()) ?? stored(draftKey()) ?? "";
    updateCount();
  }

  function clearDraft() {
    forgetDraft();
    $("idea-input").value = "";
    updateCount();
  }

  function reconcilePending(detail) {
    const key = pendingKey(detail.session);
    const raw = pendingRequests.get(key) ?? stored(key);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw);
      const latest = [...detail.messages].reverse().find((m) => m.role === "user");
      if (latest && latest.id > pending.after && latest.content === pending.content) {
        forgetDraft(detail.session);
        forgetPending(detail.session);
      }
    } catch (_) { forgetPending(detail.session); }
  }

  function toast(text) {
    $("toast").textContent = text;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3000);
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.method ? 33000 : 6000);
    try {
      const response = await fetch(path, {
        ...options, signal: controller.signal, credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Relay-Client": "local", ...options.headers },
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.detail?.message || "请求失败，请稍后重试。");
        error.code = result.detail?.code;
        error.retryable = result.detail?.retryable;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("本地服务响应超时。输入可能已保存，请刷新查看后再操作。");
      if (error instanceof TypeError) throw new Error("无法连接本地服务，请确认启动窗口仍在运行。");
      throw error;
    } finally { clearTimeout(timer); }
  }

  function highlightSession() {
    document.querySelectorAll(".session-item").forEach((button) => {
      const selected = Number(button.dataset.sessionId) === state.session?.id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-current", selected ? "true" : "false");
      button.disabled = state.busy;
    });
    $("history-count").textContent = document.querySelectorAll(".session-item").length || "";
  }

  async function refreshSessions() {
    if (window.htmx) {
      try { await window.htmx.ajax("GET", "/ui/sessions", { target: "#session-list", swap: "innerHTML" }); }
      catch (_) { toast("历史列表未能刷新，可以刷新页面查看。"); }
    }
    highlightSession();
  }

  function showError(error) {
    $("error-text").textContent = error.message;
    $("error-box").hidden = false;
    $("retry-request").hidden = !state.session || state.session.status !== "error";
    $("error-settings").hidden = document.body.dataset.keySet !== "false"
      && !/API Key|模型或温度配置|密钥配置/.test(error.message)
      && !["api_key_missing", "api_key_invalid", "api_quota_exhausted", "api_permission_denied", "model_config_invalid", "settings_unreadable"].includes(error.code)
      && !String(error.code || "").startsWith("chatgpt_");
  }

  function clearError() { $("error-box").hidden = true; }

  function setBusy(busy, label = "正在整理想法") {
    state.busy = busy;
    ["send-message", "generate-defaults", "new-session", "open-settings", "banner-settings", "retry-request", "error-settings"].forEach((id) => { $(id).disabled = busy; });
    $("idea-input").disabled = busy;
    $("rename-session").disabled = busy || !state.session;
    $("delete-session").disabled = busy || !state.session;
    $("request-status").hidden = !busy;
    clearInterval(statusTimer);
    if (busy) {
      const started = Date.now();
      $("request-status-text").textContent = `${label}…`;
      statusTimer = setInterval(() => {
        $("request-status-text").textContent = `${label}… ${Math.floor((Date.now() - started) / 1000)} 秒（自动重试最多 2 次）`;
      }, 1000);
    }
    highlightSession();
  }

  function selectOutput(message) {
    state.selected = message?.id || null;
    state.output = message?.content || "";
    $("markdown-output").textContent = state.output;
    $("markdown-output").hidden = !state.output;
    $("output-empty").hidden = !!state.output;
    $("copy-markdown").disabled = !state.output;
    $("copy-instructions").disabled = !state.output.includes("## 6. 给编程 AI 的指令\n");
    $("export-markdown").disabled = !state.output;
    $("output-state").textContent = message?.kind === "questions" ? "待你补充" : state.output ? "已生成" : "等待想法";
    document.querySelectorAll(".history-output").forEach((button) => {
      button.classList.toggle("selected", Number(button.dataset.messageId) === state.selected);
    });
  }

  function renderHistory() {
    const container = $("message-history");
    container.replaceChildren();
    state.messages.forEach((message) => {
      if (message.role === "user") {
        const article = document.createElement("article");
        article.className = "history-input";
        const label = document.createElement("span");
        label.className = "history-role";
        label.textContent = "你的输入";
        const body = document.createElement("p");
        body.textContent = message.content;
        article.append(label, body);
        container.append(article);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "history-output";
        button.dataset.messageId = String(message.id);
        button.textContent = message.kind === "questions" ? "查看这组问题 →" : "查看这份开发指令 →";
        container.append(button);
      }
    });
    $("conversation").hidden = !state.messages.length;
    $("idea-examples").hidden = !!state.messages.length;
  }

  function renderSession(detail) {
    state.session = detail?.session || null;
    state.messages = detail?.messages || [];
    $("session-title").textContent = state.session?.title || "新想法";
    $("mode-status").textContent = state.session?.use_default_assumptions
      ? "当前使用默认假设；输入“不使用默认假设”可改回先确认信息。"
      : "当前先确认信息；缺少关键信息时只问最多 5 个问题。";
    $("rename-session").disabled = state.busy || !state.session;
    $("delete-session").disabled = state.busy || !state.session;
    stored("relay-session", state.session ? String(state.session.id) : null);
    renderHistory();
    selectOutput([...state.messages].reverse().find((m) => m.role === "assistant"));
    highlightSession();
    if (state.session?.last_error) showError({ message: state.session.last_error });
  }

  function updateCount() {
    const value = $("idea-input").value;
    $("character-count").textContent = `${value.length} / 20000`;
    $("draft-status").textContent = !value ? "发送后自动保存到会话历史。"
      : stored(draftKey()) === value ? "未发送草稿已保存在本机浏览器。"
      : "草稿暂存于当前页面，请先发送再刷新。";
  }

  async function waitForProcessing() {
    setBusy(true, "正在完成上一条请求");
    const deadline = Date.now() + 35000;
    while (state.session?.status === "processing") {
      if (Date.now() >= deadline) throw new Error("上一条请求仍在处理中，请稍后刷新查看。原输入已保存。");
      await new Promise((resolve) => setTimeout(resolve, 500));
      const detail = await api(`/api/sessions/${state.session.id}`);
      if (detail.session.status !== "processing") {
        renderSession(detail);
        reconcilePending(detail);
        restoreDraft();
        await refreshSessions();
      }
    }
  }

  async function loadSession(id) {
    if (state.busy) return;
    rememberDraft();
    setBusy(true, "正在打开会话");
    clearError();
    try {
      const detail = await api(`/api/sessions/${id}`);
      renderSession(detail);
      reconcilePending(detail);
      restoreDraft();
      $("sidebar").classList.remove("mobile-open");
      $("menu-toggle").setAttribute("aria-expanded", "false");
      if (state.session.status === "processing") await waitForProcessing();
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }

  async function createSession(carryDraft = false) {
    const previous = state.session;
    const session = await api("/api/sessions", { method: "POST", body: JSON.stringify({}) });
    renderSession({ session, messages: [] });
    if (carryDraft) { forgetDraft(previous); rememberDraft(); }
    await refreshSessions();
    return session;
  }

  async function submit(defaults = false, retry = false) {
    if (state.busy) return;
    let content = $("idea-input").value.trim();
    if (!retry && !content && (!defaults || !state.messages.some((m) => m.role === "user"))) {
      toast("请先写下你想做什么。");
      $("idea-input").focus();
      return;
    }
    if (defaults && content) {
      const suffix = "\n使用默认假设，我需要结果。";
      if (content.length + suffix.length > 20000) { toast("输入太长，请缩短一点再生成。"); return; }
      content += suffix;
    }
    setBusy(true, defaults ? "正在生成完整开发指令" : retry ? "正在重试原请求" : "正在整理想法");
    clearError();
    let posting = false;
    try {
      if (!state.session) await createSession(true);
      const base = `/api/sessions/${state.session.id}`;
      if (retry) await api(`${base}/retry`, { method: "POST" });
      else if (content) {
        posting = true;
        markPending(content);
        await api(`${base}/messages`, { method: "POST", body: JSON.stringify({ content }) });
        clearDraft();
        forgetPending();
      } else await api(`${base}/generate`, { method: "POST", body: JSON.stringify({ use_default_assumptions: true }) });
      renderSession(await api(base));
      toast(state.messages.at(-1)?.kind === "questions" ? "请补充回答，或选择使用默认假设。" : "开发指令已生成并保存。");
    } catch (error) {
      if (state.session) {
        try {
          const detail = await api(`/api/sessions/${state.session.id}`);
          renderSession(detail);
          if (posting && error.code !== "busy") { reconcilePending(detail); restoreDraft(); }
          if (posting && error.code === "busy") forgetPending();
        } catch (_) { /* Keep the original failure visible. */ }
      }
      showError(error);
    } finally { setBusy(false); await refreshSessions(); }
  }

  async function copy(text, message = "已复制，保留 Markdown 原始格式。") {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else throw new Error("fallback");
    } catch (_) {
      const field = document.createElement("textarea");
      field.value = text;
      field.className = "clipboard-fallback";
      document.body.append(field);
      field.select();
      const success = document.execCommand("copy");
      field.remove();
      if (!success) { toast("复制失败，请在对应内容框中全选复制。"); return; }
    }
    toast(message);
  }

  function applySettings(settings) {
    document.body.dataset.keySet = String(settings.openai_api_key_set);
    state.provider = settings.provider || "api";
    $("provider-input").value = state.provider;
    $("connection-banner").hidden = state.provider === "chatgpt" ? chatgptStatus.connected : settings.openai_api_key_set;
    $("key-dot").classList.toggle("configured", state.provider === "chatgpt" ? chatgptStatus.connected : settings.openai_api_key_set);
    $("key-status").textContent = settings.openai_api_key_set ? "已保存，待检测" : "未配置";
    $("model-badge").textContent = state.provider === "chatgpt" ? `ChatGPT · ${settings.chatgpt_model || "请选择模型"}` : settings.model;
    $("plan-usage").hidden = state.provider !== "chatgpt" || !chatgptStatus.connected;
    $("model-input").value = settings.model;
    $("temperature-input").value = String(settings.temperature);
    $("temperature-value").textContent = String(settings.temperature);
    updateModels(chatgptStatus.models || [], settings.chatgpt_model || "");
    updateProviderFields();
  }

  async function openSettings() {
    if (state.busy) return;
    $("connection-result").hidden = true;
    $("settings-error").hidden = true;
    $("api-key").value = "";
    $("clear-api-key").checked = false;
    try { await refreshLoginState(); }
    catch (error) { toast(error.message); }
    if (!$("settings-dialog").open) $("settings-dialog").showModal();
  }

  function closeSettings() { $("settings-dialog").close(); $("api-key").value = ""; }

  $("settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (connectionBusy) return;
    const patch = settingsPatch();
    const key = patch.provider === "api" ? $("api-key").value.trim() : "";
    if (key && !/^[\x21-\x7e]{1,512}$/.test(key)) {
      $("settings-error").textContent = "API Key 格式不正确，请粘贴完整密钥；不要包含中文、空格或控制字符。";
      $("settings-error").hidden = false;
      return;
    }
    if (patch.provider === "api" && key && $("clear-api-key").checked) {
      $("settings-error").textContent = "填写新密钥和清除密钥不能同时选择。";
      $("settings-error").hidden = false;
      return;
    }
    if (key) patch.openai_api_key = key;
    else if (patch.provider === "api" && $("clear-api-key").checked) patch.openai_api_key = "";
    $("save-settings").disabled = true;
    try {
      applySettings(await api("/api/settings", { method: "PUT", body: JSON.stringify(patch) }));
      closeSettings();
      toast("设置已在本机保存。需要时可在设置中检测连接。");
    } catch (error) { $("settings-error").textContent = error.message; $("settings-error").hidden = false; }
    finally { $("save-settings").disabled = false; }
  });

  function updateModels(models, selected = $("chatgpt-model").value) {
    const select = $("chatgpt-model");
    select.replaceChildren();
    if (!models.length) select.add(new Option("登录后刷新可用模型", ""));
    for (const model of models) select.add(new Option(model.display_name, model.slug));
    if (models.some((model) => model.slug === selected)) select.value = selected;
    renderLoginAccount();
  }

  function renderLoginAccount() {
    const account = chatgptStatus.account || "ChatGPT 账户";
    $("chatgpt-account").textContent = chatgptStatus.connected ? `已授权：${account}` : chatgptStatus.signed_in ? `已登录：${account}（${chatgptStatus.plan_enabled ? "授权已过期" : "模型尚未授权"}）` : chatgptStatus.message || "尚未使用 ChatGPT 登录。";
    $("chatgpt-logout").hidden = !(chatgptStatus.signed_in || chatgptStatus.connected);
    $("cancel-chatgpt-login").hidden = !chatgptStatus.pending;
    $("chatgpt-login").textContent = chatgptStatus.pending ? "重新打开官方授权页" : chatgptStatus.signed_in ? "重新登录" : "使用 ChatGPT 继续";
    const check = chatgptStatus.connection_check?.model === $("chatgpt-model").value ? chatgptStatus.connection_check : null;
    const loginFailed = !chatgptStatus.pending && chatgptStatus.result?.ok === false && !["chatgpt_login_cancelled", "chatgpt_signed_out"].includes(chatgptStatus.result.code);
    $("login-step-identity").textContent = `账号登录：${chatgptStatus.signed_in ? "已登录" : chatgptStatus.pending ? "正在登录" : loginFailed ? "本机授权未完成，原因见下方" : "等待登录"}`;
    $("login-step-plan").textContent = `模型授权：${chatgptStatus.plan_enabled ? "已授权" : chatgptStatus.signed_in ? "尚未授权，请点击下方授权按钮" : "等待授权"}`;
    $("login-step-model").textContent = `模型连接：${check ? check.ok ? "最近一次检测或调用通过" : "检测或调用失败，原因见下方" : "待检测；登录和模型列表不代表调用成功"}`;
    $("reauthorize-chatgpt").hidden = chatgptStatus.pending || !chatgptStatus.signed_in || (chatgptStatus.plan_enabled && !["chatgpt_plan_not_enabled", "chatgpt_scope_rejected"].includes(check?.code));
    $("use-api-key").hidden = chatgptStatus.pending || !(check?.ok === false || chatgptStatus.result?.ok === false);
    const failure = chatgptStatus.pending ? null : check?.ok === false ? check : loginFailed ? chatgptStatus.result : null;
    const evidence = chatgptStatus.failure;
    const detail = `${evidence?.location ? `失败环节：${evidence.location}。` : ""}${evidence?.provider_code ? `官方错误码：${evidence.provider_code}。` : ""}${evidence?.http_status ? `HTTP ${evidence.http_status}。` : ""}`;
    $("login-error-code").textContent = failure ? `${detail}报错代码：${failure.code || "未记录具体代码"}。点击“复制登录报错”获取完整反馈。` : "";
    $("login-error-code").hidden = !failure;
    if (loginReturned) {
      $("login-return-title").textContent = chatgptStatus.pending ? "正在完成本机授权" : loginFailed ? "本次登录未完成" : chatgptStatus.connected ? "账号登录和计划授权已完成" : chatgptStatus.signed_in ? "账号已登录，模型尚未授权" : "本机尚未取得登录授权";
      $("login-return-message").textContent = loginFailed ? chatgptStatus.result.message : chatgptStatus.message || "请检查登录结果。";
      $("login-return-evidence").textContent = failure ? `${detail}报错代码：${failure.code}。` : "请选择模型并检测连接；账号登录不等于模型调用已通过。";
    }
  }

  function showLoginResult() {
    if ($("provider-input").value !== "chatgpt") return;
    const result = chatgptStatus.result;
    const check = chatgptStatus.connection_check;
    $("connection-result").textContent = chatgptStatus.pending ? chatgptStatus.message : check?.ok === false ? check.message : result?.message || chatgptStatus.message || "尚未收到登录结果，请完成官方授权后返回。";
    $("connection-result").hidden = false;
  }

  function showPlanWelcome() {
    if (chatgptStatus.connected && !stored("relay-chatgpt-welcome") && !$("plan-welcome").open && $("settings-dialog").open) $("plan-welcome").showModal();
  }

  function scheduleLoginPoll() {
    clearTimeout(loginTimer);
    if (!chatgptStatus.pending) return;
    loginTimer = setTimeout(async () => {
      try {
        chatgptStatus = await api("/api/auth/chatgpt/status");
        if (!chatgptStatus.pending) applySettings(await api("/api/settings"));
        renderLoginAccount();
        showLoginResult();
        if (!chatgptStatus.pending) showPlanWelcome();
      } catch (error) {
        if ($("settings-dialog").open) {
          $("connection-result").textContent = `${error.message} 正在自动重新检查登录结果。`;
          $("connection-result").hidden = false;
        }
      } finally { scheduleLoginPoll(); }
    }, 1000);
  }

  async function refreshLoginState() {
    const selection = $("settings-dialog").open ? $("provider-input").value : null;
    chatgptStatus = await api("/api/auth/chatgpt/status");
    applySettings(await api("/api/settings"));
    if (selection) { $("provider-input").value = selection; updateProviderFields(); }
    showLoginResult();
    scheduleLoginPoll();
  }

  function updateProviderFields() {
    const chatgpt = $("provider-input").value === "chatgpt";
    $("api-fields").hidden = chatgpt;
    $("chatgpt-fields").hidden = !chatgpt;
    $("model-input").required = !chatgpt;
  }

  function settingsPatch() {
    const patch = { provider: $("provider-input").value, model: $("model-input").value.trim(), temperature: Number($("temperature-input").value) };
    if ($("chatgpt-model").value) patch.chatgpt_model = $("chatgpt-model").value;
    return patch;
  }

  async function connectionAction(action) {
    if (connectionBusy || state.busy) return;
    connectionBusy = true;
    const ids = ["save-settings", "test-connection", "import-key-text", "import-key-file", "chatgpt-login", "reauthorize-chatgpt", "use-api-key", "chatgpt-logout", "refresh-chatgpt-models", "check-chatgpt-login", "cancel-chatgpt-login", "run-diagnostics", "copy-login-error", "copy-login-return"];
    ids.forEach((id) => { $(id).disabled = true; });
    $("settings-error").hidden = true;
    $("connection-result").textContent = "正在检查，请稍候…";
    $("connection-result").hidden = false;
    try { await action(); }
    catch (error) {
      if ($("provider-input").value === "chatgpt") {
        try { await refreshLoginState(); } catch (_) { /* Keep the original failure visible. */ }
      }
      $("connection-result").textContent = error.message;
    }
    finally { connectionBusy = false; ids.forEach((id) => { $(id).disabled = false; }); }
  }

  async function importKey(content) {
    if (!content.trim()) throw new Error("请先粘贴密钥，或选择密钥文件。");
    const result = await api("/api/settings/import-key", { method: "POST", body: JSON.stringify({ content }) });
    applySettings(result.settings);
    $("api-key").value = "";
    $("key-file").value = "";
    $("connection-result").textContent = result.connection.ok ? "密钥已导入，连接检测通过。" : `密钥已保存，连接尚未通过：${result.connection.message}`;
  }

  $("provider-input").addEventListener("change", () => { updateProviderFields(); $("connection-result").hidden = true; showLoginResult(); });
  async function collectDiagnostics(checkNetwork, copyOnly = false) {
    const result = await api("/api/diagnostics/run", { method: "POST", body: JSON.stringify({ check_network: checkNetwork }) });
    diagnosticReport = JSON.stringify(result, null, 2) + "\n";
    $("diagnostic-summary").textContent = result.summary;
    $("diagnostic-summary").hidden = false;
    $("diagnostic-output").textContent = diagnosticReport;
    $("diagnostic-details").hidden = false;
    $("copy-diagnostics").disabled = false;
    if (copyOnly) {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(diagnosticReport);
        $("connection-result").textContent = `已复制报错反馈：${result.feedback?.problem_location || "见报告"}；错误码：${result.feedback?.error_code || "尚未记录失败"}。直接粘贴给开发者即可。`;
        toast("已复制登录报错和脱敏报告。");
        return;
      } catch (_) { /* Download the same report when clipboard permission is unavailable. */ }
    }
    const url = URL.createObjectURL(new Blob([diagnosticReport], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relay-diagnostics-${result.report_id.slice(0, 8)}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    $("connection-result").textContent = copyOnly ? "浏览器不允许自动复制，报错报告已下载。发送 JSON 文件，或点击下方复制诊断报告。" : "自检完成，诊断报告已导出。请把 JSON 文件反馈给开发者。";
  }
  $("run-diagnostics").addEventListener("click", () => { void connectionAction(() => collectDiagnostics($("diagnostic-network").checked)); });
  $("copy-login-error").addEventListener("click", () => { void connectionAction(() => collectDiagnostics(false, true)); });
  $("copy-login-return").addEventListener("click", () => { void connectionAction(() => collectDiagnostics(false, true)); });
  $("copy-diagnostics").addEventListener("click", () => { if (diagnosticReport) void copy(diagnosticReport, "已复制脱敏诊断报告。"); });
  $("import-key-text").addEventListener("click", () => { void connectionAction(() => importKey($("api-key").value)); });
  $("import-key-file").addEventListener("click", () => $("key-file").click());
  $("key-file").addEventListener("change", () => {
    const file = $("key-file").files[0];
    if (!file) return;
    void connectionAction(async () => {
      if (file.size > 16384) throw new Error("密钥文件超过 16 KB，请选择只包含密钥的小文件。");
      await importKey(await file.text());
    });
  });
  $("test-connection").addEventListener("click", () => { void connectionAction(async () => {
    const patch = settingsPatch();
    if (patch.provider === "api" && $("api-key").value.trim()) patch.openai_api_key = $("api-key").value.trim();
    if (patch.provider === "api" && $("clear-api-key").checked) {
      if (patch.openai_api_key) throw new Error("填写新密钥和清除密钥不能同时选择。");
      patch.openai_api_key = "";
    }
    applySettings(await api("/api/settings", { method: "PUT", body: JSON.stringify(patch) }));
    $("api-key").value = "";
    const result = await api("/api/settings/test-connection", { method: "POST" });
    if (patch.provider === "chatgpt") await refreshLoginState();
    $("connection-result").textContent = result.message;
  }); });
  $("refresh-chatgpt-models").addEventListener("click", () => { void connectionAction(async () => {
    const result = await api("/api/auth/chatgpt/models", { method: "POST" });
    chatgptStatus.models = result.models;
    updateModels(result.models);
    applySettings(await api("/api/settings"));
    $("connection-result").textContent = result.models.length ? "已更新账户可用模型。" : "账户暂未返回可用模型，请检查官方账户权限。";
  }); });
  $("chatgpt-logout").addEventListener("click", () => { void connectionAction(async () => {
    const result = await api("/api/auth/chatgpt/logout", { method: "POST" });
    chatgptStatus = await api("/api/auth/chatgpt/status");
    applySettings(await api("/api/settings"));
    $("connection-result").textContent = result.message;
    scheduleLoginPoll();
  }); });
  $("check-chatgpt-login").addEventListener("click", () => { void connectionAction(async () => { await refreshLoginState(); showPlanWelcome(); }); });
  $("cancel-chatgpt-login").addEventListener("click", () => { void connectionAction(async () => {
    chatgptStatus = await api("/api/auth/chatgpt/cancel", { method: "POST" });
    renderLoginAccount(); showLoginResult(); scheduleLoginPoll();
  }); });
  function beginChatGPTLogin(authorizePlan = false) {
    if (connectionBusy || state.busy) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    void connectionAction(async () => {
      try {
        const result = await api(`/api/auth/chatgpt/start${authorizePlan ? "?authorize_plan=true" : ""}`, { method: "POST" });
        if (popup) popup.location.href = result.authorization_url;
        else { window.location.href = result.authorization_url; return; }
        $("connection-result").textContent = "请在官方页面完成登录与授权，完成后自动接续。";
        await refreshLoginState();
        showPlanWelcome();
      } catch (error) { if (popup) popup.close(); throw error; }
    });
  }
  $("chatgpt-login").addEventListener("click", () => beginChatGPTLogin(false));
  $("reauthorize-chatgpt").addEventListener("click", () => beginChatGPTLogin(true));
  $("chatgpt-model").addEventListener("change", renderLoginAccount);
  $("use-api-key").addEventListener("click", () => {
    $("provider-input").value = "api";
    updateProviderFields();
    $("connection-result").textContent = "已选择 API Key 连接。粘贴密钥并点击“导入并检测”；API 与 ChatGPT 订阅分别计费。";
    $("api-key").focus();
  });
  $("plan-understood").addEventListener("click", () => { stored("relay-chatgpt-welcome", "1"); $("plan-welcome").close(); });
  function openAction(action) {
    if (!state.session || state.busy) return;
    state.action = action;
    const rename = action === "rename";
    $("action-heading").textContent = rename ? "重命名会话" : "删除这个会话？";
    $("action-description").textContent = rename ? "用一个便于查找的名字记录这个想法。" : "这会删除此会话的输入和生成结果，无法撤销。";
    $("rename-label").hidden = !rename;
    $("rename-input").hidden = !rename;
    $("rename-input").required = rename;
    $("rename-input").value = state.session.title;
    $("confirm-action").textContent = rename ? "保存名称" : "删除会话";
    $("confirm-action").classList.toggle("delete-confirm", !rename);
    $("action-error").hidden = true;
    $("action-dialog").showModal();
  }

  $("action-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.session || state.busy) return;
    const id = state.session.id;
    const title = $("rename-input").value.trim();
    if (state.action === "rename" && !title) return;
    setBusy(true, "正在保存");
    $("confirm-action").disabled = true;
    try {
      if (state.action === "rename") {
        await api(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
        renderSession(await api(`/api/sessions/${id}`));
        toast("名称已保存。");
      } else {
        await api(`/api/sessions/${id}`, { method: "DELETE" });
        forgetDraft();
        forgetPending();
        renderSession(null);
        restoreDraft(); clearError();
        toast("会话已删除。");
      }
      $("action-dialog").close();
      await refreshSessions();
    } catch (error) { $("action-error").textContent = error.message; $("action-error").hidden = false; }
    finally { setBusy(false); $("confirm-action").disabled = false; }
  });

  $("new-session").addEventListener("click", async () => {
    if (state.busy) return;
    rememberDraft();
    setBusy(true, "正在新建会话"); clearError();
    try { await createSession(); restoreDraft(); }
    catch (error) { showError(error); }
    finally { setBusy(false); $("idea-input").focus(); }
  });
  $("message-form").addEventListener("submit", (event) => { event.preventDefault(); void submit(); });
  $("generate-defaults").addEventListener("click", () => { void submit(true); });
  $("retry-request").addEventListener("click", () => { void submit(false, true); });
  $("idea-input").addEventListener("input", rememberDraft);
  $("idea-input").addEventListener("keydown", (event) => {
    if (!event.isComposing && event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit(); }
  });
  $("session-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-session-id]");
    if (button) void loadSession(Number(button.dataset.sessionId));
  });
  document.body.addEventListener("htmx:afterSwap", highlightSession);
  document.body.addEventListener("htmx:responseError", () => { toast("历史列表加载失败，请刷新页面。"); });
  $("message-history").addEventListener("click", (event) => {
    const button = event.target.closest("[data-message-id]");
    if (button) selectOutput(state.messages.find((m) => m.id === Number(button.dataset.messageId)));
  });
  document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => {
    if (state.busy) return;
    $("idea-input").value = button.dataset.example; rememberDraft(); $("idea-input").focus();
  }));
  $("copy-markdown").addEventListener("click", () => { if (state.output) void copy(state.output); });
  $("copy-instructions").addEventListener("click", () => {
    const section = state.output.match(/## 6\. 给编程 AI 的指令\n([\s\S]*?)\n## 7\. 自检/);
    if (section) void copy(`## 6. 给编程 AI 的指令\n${section[1].trim()}\n`);
  });
  $("export-markdown").addEventListener("click", () => {
    if (state.session && state.selected) window.location.assign(`/api/sessions/${state.session.id}/export?message_id=${state.selected}`);
  });
  ["open-settings", "banner-settings", "error-settings"].forEach((id) => $(id).addEventListener("click", () => { void openSettings(); }));
  ["close-settings", "cancel-settings"].forEach((id) => $(id).addEventListener("click", closeSettings));
  $("settings-dialog").addEventListener("close", () => { $("api-key").value = ""; });
  $("temperature-input").addEventListener("input", () => {
    $("temperature-input").value = String(Math.round(Number($("temperature-input").value) * 100) / 100);
    $("temperature-value").textContent = $("temperature-input").value;
  });
  $("rename-session").addEventListener("click", () => openAction("rename"));
  $("delete-session").addEventListener("click", () => openAction("delete"));
  $("cancel-action").addEventListener("click", () => $("action-dialog").close());
  $("theme-toggle").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    stored("relay-theme", dark ? "dark" : "light");
    $("theme-toggle").textContent = dark ? "切换浅色模式" : "切换深色模式";
  });
  $("menu-toggle").addEventListener("click", () => {
    const open = $("sidebar").classList.toggle("mobile-open");
    $("menu-toggle").setAttribute("aria-expanded", String(open));
  });

  document.documentElement.dataset.theme = stored("relay-theme") || "light";
  $("theme-toggle").textContent = document.documentElement.dataset.theme === "dark" ? "切换浅色模式" : "切换深色模式";
  if (loginReturned) {
    window.history.replaceState({}, "", "/");
    void openSettings().then(() => {
      $("provider-input").value = "chatgpt";
      updateProviderFields(); renderLoginAccount(); showLoginResult(); showPlanWelcome();
    }).catch((error) => toast(error.message));
  } else void refreshLoginState().catch(() => {});
  window.addEventListener("focus", () => {
    if (!connectionBusy && (chatgptStatus.pending || state.provider === "chatgpt")) void refreshLoginState().catch(() => {});
  });
  restoreDraft();
  highlightSession();
  const lastSession = Number(stored("relay-session"));
  if (lastSession && document.querySelector(`[data-session-id="${lastSession}"]`)) void loadSession(lastSession);
  else setBusy(false);
})();
