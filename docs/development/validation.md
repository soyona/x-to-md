# 验证规范

`.codexrules` 的授权、安全与产品边界高于本文件。

## 默认验证

| 改动类型 | 必需验证 |
|---|---|
| README、规则、Memory Bank | `git diff --check` |
| `markdown.js`、`content.js`、`manifest.json`、Popup 或 Preview | `npm test`、`git diff --check` |
| Chrome 实际页面兼容性 | 用户明确要求时，手动加载未打包扩展并在真实 X 页面验收 |

## 执行原则

- 仅在依赖缺失或 `package.json` 变化时运行 `npm install`。
- 优先运行与改动直接相关的测试；完成行为变更后运行一次完整 `npm test`。
- 若测试失败，记录具体用例和与本次改动的关系；代码未变化时不重复执行同一失败套件。
- 不将静态测试或 Manifest 校验表述为真实 X DOM、剪贴板权限或 Chrome Store 审核已通过。
- 提交前确认 `git diff --check` 通过，并核对暂存范围不含无关改动。
