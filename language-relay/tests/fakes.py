import asyncio
import json
from copy import deepcopy


def fact(text: str, basis="assumption", evidence=None):
    return {"text": text, "basis": basis, "evidence": evidence}


def questions_reply(count=3):
    questions = [
        "游戏运行在什么平台？",
        "核心玩法是什么？",
        "第一个版本必须包含哪项功能？",
        "玩家人数是多少？",
        "是否需要联网？",
        "第六个问题？",
    ][:count]
    return {"need_more_info": True, "questions": questions, "report": None}


def full_reply():
    return {
        "need_more_info": False,
        "questions": [],
        "report": {
            "understanding": [fact("我想做卡牌游戏", "user", "我想做卡牌游戏")],
            "analysis": {
                "actors": [fact("私人玩家在本机浏览器验证单人对战玩法。")],
                "workflow": [fact("启动一局→抽牌→出牌→结束回合→判定胜负→重开。")],
                "constraints": [fact("首版离线运行，状态仅保留到页面关闭。")],
                "out_of_scope": [fact("首版不做联网对战、支付和账号。")],
                "open_issues": [fact("卡牌数值和胜负规则待试玩确认，先用固定牌组验证闭环。")],
            },
            "motivation": [fact("先验证抽牌、出牌和回合循环是否能形成完整体验。")],
            "requirements": {
                "must_do": [fact("实现抽牌、出牌、回合结束和胜负判定。")],
                "optional": [fact("后续加入卡牌编辑器。")],
                "quantified": [fact("在本机浏览器、缓存清空后，首屏 ≤1 秒。")],
            },
            "technical_plan": [fact("使用 TypeScript 和 Vite 构建本地浏览器原型。")],
            "instructions": {
                "role": [fact("担任前端游戏工程师，负责实现并验证以下原型。")],
                "goal": [fact("交付可启动的单人卡牌游戏，完成一局即可判定胜负。")],
                "context": [fact("原型供私人验证玩法，本地运行，不连接第三方服务。")],
                "tech_stack": [fact("使用 TypeScript、Vite 和原生 DOM。")],
                "output_format": [fact("交付完整文件、启动命令、测试命令和验收记录。")],
            },
            "planning": {
                "decisions": [
                    {
                        "choice": fact("使用纯前端单体，规则与界面分开，本机离线运行。"),
                        "alternative": fact("需要跨设备存档时可增加服务端和数据库。"),
                        "reason": fact("当前只验证单人玩法，不承担服务器运维成本。"),
                        "tradeoff": fact("关闭页面即丢失进度；确认存档需求后再加入持久化。"),
                    }
                ],
                "data_flow": [
                    fact("按钮输入→规则校验→新 GameState→界面渲染；非法操作显示错误并保留原状态。")
                ],
                "data_model": [
                    fact(
                        "GameState 包含 hand:string[]、deck:string[]、hp:number、turn:number、status:playing/won/lost；牌不得同时在手牌和牌库。"
                    )
                ],
                "modules": [
                    {
                        "id": "M1",
                        "name": fact("界面与启动"),
                        "responsibility": fact("绑定输入并渲染规则返回的状态，不在 DOM 中计算胜负。"),
                        "files": [
                            {"path": fact("src/main.ts"), "purpose": fact("初始化页面、事件和状态渲染。")},
                            {"path": fact("index.html"), "purpose": fact("页面入口与操作区域。")},
                        ],
                        "requirement_ids": ["R1", "Q1"],
                        "depends_on": ["M2"],
                    },
                    {
                        "id": "M2",
                        "name": fact("游戏规则"),
                        "responsibility": fact("维护牌库、回合与胜负不变量，拒绝非法操作。"),
                        "files": [
                            {
                                "path": fact("src/game.ts"),
                                "purpose": fact("定义 GameState、出牌和回合转换。"),
                            },
                            {
                                "path": fact("tests/game.test.ts"),
                                "purpose": fact("测试合法与非法操作和重开。"),
                            },
                        ],
                        "requirement_ids": ["R1"],
                        "depends_on": [],
                    },
                ],
                "interfaces": [
                    {
                        "id": "I1",
                        "kind": "function",
                        "module_id": "M2",
                        "requirement_ids": ["R1"],
                        "operation": fact("game.playCard(cardId: string): GameState"),
                        "input": fact("cardId 为必填非空字符串，必须属于当前手牌且状态为 playing。"),
                        "output": fact("返回新 GameState，移除该牌并更新 hp/status，原对象不修改。"),
                        "errors": [fact("INVALID_CARD 或 GAME_FINISHED；失败时原状态和牌库不变。")],
                        "security": fact("本机纯函数无需身份认证，传入值仍须校验，卡牌名称按纯文本渲染。"),
                        "idempotency": fact("出牌有副作用，重复 cardId 将返回 INVALID_CARD，不再次扣血。"),
                        "examples": [
                            fact('手牌含 c1 时传入 "c1"，返回 hand 不含 c1 的 GameState。'),
                            fact('传入不存在的 "c999"，抛出 INVALID_CARD 并保持状态不变。'),
                        ],
                    },
                    {
                        "id": "I2",
                        "kind": "function",
                        "module_id": "M1",
                        "requirement_ids": ["R1", "Q1"],
                        "operation": fact("view.renderState(state: GameState): void"),
                        "input": fact("state 必填，hp/turn 为有限数值，hand/deck 为字符串数组。"),
                        "output": fact("返回 void，更新手牌、回合、生命值和结束提示。"),
                        "errors": [fact("INVALID_STATE：拒绝缺字段或非有限数值，显示可恢复错误。")],
                        "security": fact("不发送网络请求，使用 textContent 避免执行卡牌名中的 HTML。"),
                        "idempotency": fact("同一状态重复渲染得到同一页面，不叠加事件监听。"),
                        "examples": [
                            fact("传入 playing 状态，显示手牌并启用出牌按钮。"),
                            fact("传入 hp=NaN，显示 INVALID_STATE 且保留上次正常页面。"),
                        ],
                    },
                ],
                "tasks": [
                    {
                        "id": "T1",
                        "title": fact("实现规则与可运行的一局状态循环。"),
                        "module_ids": ["M2"],
                        "requirement_ids": ["R1"],
                        "depends_on": [],
                        "deliverable": fact("交付 src/game.ts、状态类型和 rules 测试。"),
                        "verification": fact(
                            "运行规则测试，覆盖抽牌、出牌、回合、胜负与非法 cardId 状态不变。"
                        ),
                    },
                    {
                        "id": "T2",
                        "title": fact("接入界面并完成闭环、性能和重开验收。"),
                        "module_ids": ["M1"],
                        "requirement_ids": ["R1", "Q1"],
                        "depends_on": ["T1"],
                        "deliverable": fact("交付 index.html、src/main.ts 和可启动的 Vite 项目。"),
                        "verification": fact("本机浏览器完成 1 局和重开，再清缓存测量首屏并按 Q1 验收。"),
                    },
                ],
                "acceptance": [
                    {
                        "id": "C1",
                        "requirement_ids": ["R1"],
                        "scenario": fact(
                            "给定初始牌组，完成 1 局后显示胜负；重开后牌库、回合和生命值恢复初始值。"
                        ),
                        "verification": fact("运行规则测试并实际操作一局，比较重开前后的 GameState。"),
                    },
                    {
                        "id": "C2",
                        "requirement_ids": ["R1"],
                        "scenario": fact(
                            "给定有效一局，连续出同一 cardId 时第二次显示 INVALID_CARD，生命值和手牌不再变化。"
                        ),
                        "verification": fact("调用出牌函数两次并断言错误码与第二次调用前后状态完全一致。"),
                    },
                    {
                        "id": "C3",
                        "requirement_ids": ["Q1"],
                        "scenario": fact("本机浏览器缓存清空后首屏 ≤1 秒；测量条件与 Q1 相同。"),
                        "verification": fact("用浏览器 Performance 记录首次绘制，重复 3 次并保存结果。"),
                    },
                ],
                "risks": [
                    {
                        "id": "K1",
                        "category": "data",
                        "level": "medium",
                        "module_ids": ["M2"],
                        "requirement_ids": ["R1"],
                        "description": fact("重复出牌可能导致扣血和牌库状态失真。"),
                        "trigger": fact("玩家连续点击或回合结束后仍触发出牌。"),
                        "mitigation": fact(
                            "规则先校验再产生新状态，错误不提交状态，UI 在游戏结束后禁用操作。"
                        ),
                        "verification": fact("模拟连点和已结束状态，验证不重复扣血且错误后仍可重开。"),
                    },
                    {
                        "id": "K2",
                        "category": "performance",
                        "level": "low",
                        "module_ids": ["M1"],
                        "requirement_ids": ["Q1"],
                        "description": fact("大量卡图资源可能使首屏超过量化目标。"),
                        "trigger": fact("引入大图或远程资源。"),
                        "mitigation": fact("首版使用本地图文，卡图延迟加载；超标时缩减首屏资源。"),
                        "verification": fact("清空缓存后测量 Q1，并核对网络面板没有远程资源。"),
                    },
                ],
            },
            "self_check": [fact("验收时逐项确认玩法规则、目录、接口和必须功能对应，所有推断均标记假设。")],
        },
    }


class SlowReply:
    def __init__(self, delay=1.0, reply=None, started=None):
        self.delay = delay
        self.reply = reply or questions_reply()
        self.started = started


class ScriptedTransport:
    def __init__(self, outcomes=None):
        self.outcomes = list(outcomes or [questions_reply()])
        self.calls = []

    async def request(self, **kwargs):
        self.calls.append(deepcopy(kwargs))
        outcome = self.outcomes.pop(0) if len(self.outcomes) > 1 else self.outcomes[0]
        if isinstance(outcome, BaseException):
            raise outcome
        if isinstance(outcome, SlowReply):
            if outcome.started:
                outcome.started.set()
            await asyncio.sleep(outcome.delay)
            outcome = outcome.reply
        return outcome if isinstance(outcome, str) else json.dumps(outcome, ensure_ascii=False)
