# X DOM 集成契约

本文件记录 x-to-md 与 X Web 集成时已经验证的页面事实和实现边界。只有修改 X DOM、Card、Grok 左侧入口或独立菜单时读取。

## 已验证锚点

- 入口锚点：`button[aria-label="Grok actions"]`
- Post/Card 根节点：`article[data-testid="tweet"]`
- 虚拟列表上下文：`[data-testid="cellInnerDiv"]`
- 局部观察根节点：`main`
- 原生 More：`button[data-testid="caret"][aria-haspopup="menu"]`，只属于 X，不作为扩展菜单触发器

入口的直接视觉结构按同一动作行中的三个兄弟槽位理解：

```text
x-to-md slot | Grok slot | More slot
```

## 所有权边界

| 对象 | 所有者 | 允许的复用 |
|---|---|---|
| Grok 按钮和状态 | X | 可克隆稳定视觉结构与 SVG class |
| More 按钮和 Dropdown | X | 不复用点击、Portal、菜单挂载或重绘生命周期 |
| x-to-md 按钮 | 扩展 | 自主管理 hover、focus、expanded 和 click |
| x-to-md 菜单 | 扩展 | 自主创建、定位、关闭和读取动态状态 |

## 禁止架构

- 不执行原生 `caret.click()` 来打开扩展菜单。
- 不等待或改写 X 的 `[data-testid="Dropdown"]`。
- 不通过隐藏原生菜单项制造“独立菜单”。
- 不通过 `pointerover`、`mousemove`、hover 或滚动启动核心入口注入。
- 不以整个 `document` 作为默认观察范围。
- 不从同一详情页中的相关内容链接推断当前 Post/Article 身份。

## 注入生命周期

1. Content Script 初始化并发布可读取的 revision/阶段诊断。
2. 若 `main` 尚未挂载，以可取消的短周期任务等待。
3. `main` 可用后扫描当前可见 Card。
4. 只观察 `main` 中新增节点所属的局部 Card。
5. 以 `data-x-to-md-article-actions-entry` 保证同一 Card 幂等。
6. 点击入口后，从所属 Card 生成 Post/Article 候选并直接创建扩展菜单。
7. 再次点击、点击外部、`Escape`、滚动或窗口缩放时关闭菜单。
8. Content Script dispose 时释放定时器、观察器、样式、菜单和入口节点。

## UI 分层诊断

遇到视觉问题时按层级定位，不用同一组 CSS 同时猜测多个原因：

| 现象 | 首先检查 |
|---|---|
| 图形轮廓不正确 | SVG path 与 `viewBox` |
| 图标大小不一致 | SVG class、width、height |
| 与 Grok/More 不对齐 | slot、按钮内部结构、flex 与 line box |
| hover 无反馈 | 按钮自身 hover/focus/expanded 状态 |
| Card 内容发生位移 | 注入节点几何和动作行父容器布局 |
| 图标延迟出现 | Content Script revision、`main` 等待和局部观察阶段 |

## 最小 DOM 取证

页面结构不确定时，只返回支持当前决策的小型 JSON。至少包括：目标数量、直接父节点、最近 Card 和关键祖先属性。禁止先返回整页 DOM 再裁剪。

当前诊断入口：

```js
({
  revision: document.documentElement.dataset.xToMdContentScriptRevision,
  stage: document.documentElement.dataset.xToMdArticleActionsStage,
  grok: document.querySelectorAll('button[aria-label="Grok actions"]').length,
  xToMd: document.querySelectorAll('[data-x-to-md-article-actions-entry]').length,
})
```

## 行为验收矩阵

至少覆盖：Home Post、作者 Posts、作者 Articles、`/status`、`/article`；验证入口位置、hover/focus、菜单无 More 闪现、五项动态文案、当前 Card 上下文、重复注入、虚拟列表追加、关闭方式和 Content Script 重载。

静态测试必须明确阻止原生 More 依赖；真实 X 页面兼容性仍需用户明确授权后验收。
