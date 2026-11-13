# 贡献指南

感谢想参与改进「刻时」。

## 提 Issue

- **Bug**：请写清楚 Android 版本、平板型号、横屏还是竖屏、复现步骤，有截图最好
- **功能建议**：说明使用场景，最好给出你期望的交互，而不是只说「加个功能」
- 提问前可以先搜一下已有 issue

## 提 PR

1. 从 `main` 切分支：`git checkout -b feat/xxx`
2. 保持代码风格：
   - 前端是零依赖的原生 JS，**不要引入框架或构建工具**
   - CSS 变量都定义在 `web/styles.css` 顶部，颜色不要写死在组件里
   - 界面文字用中文，注释可以中文
3. 改完跑一遍自测：用浏览器打开 `tools/test.html`，页面会输出 18 项检查，必须全 PASS
4. 提交信息用中文或英文都可以，说清楚「改了什么 / 为什么」
5. PR 描述里附截图（涉及界面时）

## 不能提交的东西

- `keystore/` 里的签名文件
- `build/` 目录与任何 `.apk`
- 你自己的 `localStorage` 备份数据

## 代码结构提示

- `web/app.js` 是纯 IIFE，所有逻辑在里面；入口在文件底部 `load() → applyPrefs() → render*()`
- 计时相关的状态放在 `cur` 对象，并实时 `saveCur()` 落盘
- 原生能力通过 `AndroidBridge` 暴露：`syncTimer` / `setBars` / `setKeepScreen` / `saveBackup`
- 加新页面需要在 `web/index.html` 加 `<section class="screen" data-screen="xxx">`，并在 `styles.css` 里放行该 screen 的显示规则
