<a id="readme-top"></a>

<br />
<div align="center">
  <a href="https://github.com/WAY29/Resender">
    <img src="public/icon.png" alt="Resender logo" width="96" height="96">
  </a>

  <h3 align="center">Resender</h3>

  <p align="center">
    一个用于编辑并重放已捕获 Fetch/XHR 请求的 Chrome DevTools 扩展
    <br />
    <a href="https://github.com/WAY29/Resender/issues">报告问题</a>
    ·
    <a href="https://github.com/WAY29/Resender/issues">请求功能</a>
  </p>
</div>

## 目录

1. [关于项目](#关于项目)
2. [技术栈](#技术栈)
3. [快速开始](#快速开始)
4. [使用方式](#使用方式)
5. [路线图](#路线图)
6. [贡献](#贡献)
7. [许可证](#许可证)
8. [联系方式](#联系方式)
9. [致谢](#致谢)

## 关于项目

Resender 会添加一个专用的 DevTools 面板，复刻 Chrome Network 面板中用于检查、编辑和重放请求的关键能力。它存在的原因是 Chrome 扩展无法直接向内置 Network 面板的右键菜单添加 `Edit and resend` 功能。

当前功能：

- 捕获当前被检查标签页中的 Fetch/XHR 请求，页面导航时不会自动清空记录
- 检查请求元信息、请求头、Payload、响应头和响应正文
- 编辑可重放请求的请求头和 Payload，并从被检查页面中重新发送请求
- 关联重定向链，让 3xx 请求可以跳转到最终请求
- 支持请求列表排序、列宽调整、列表/详情分栏调整和关闭详情页
- 支持导入和导出 Resender 请求捕获记录
- 跟随 Chrome 语言偏好自动显示英文或简体中文界面

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 技术栈

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Vitest](https://vitest.dev/)
- [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 快速开始

### 环境要求

- Node.js 20 或更新版本
- npm
- Chrome 114 或更新版本

### 从 Releases 安装

1. 打开 [Releases](https://github.com/WAY29/Resender/releases) 页面
2. 下载最新的 `resender-*.zip` 文件
3. 将压缩包解压到本地文件夹
4. 打开 `chrome://extensions`
5. 启用 `开发者模式`
6. 点击 `加载已解压的扩展程序`，选择刚才解压后的文件夹

### 本地开发

```sh
git clone https://github.com/WAY29/Resender.git
cd Resender
npm ci
npm run test
npm run typecheck
npm run build
```

生产扩展会生成到 `dist/`。`dist/` 目录会被 Git 忽略，发布包由 GitHub Releases 自动生成。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 使用方式

1. 在 Chrome 中加载扩展
2. 打开目标页面的 DevTools
3. 选择 `Resender` DevTools 面板
4. 页面发起 Fetch/XHR 请求时保持捕获开启
5. 选择一个请求，查看 Headers、Payload 和 Response 数据
6. 编辑请求头或 Payload，然后点击 `发送` 重放请求
7. 使用导入/导出功能在不同会话之间迁移捕获记录

部分浏览器控制的请求头无法重放，因为它们由 Chrome 和 Fetch 管理。二进制、流式、超限和不支持的请求体会用于上下文展示，但暂时不可编辑。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 路线图

- 进一步提升与 Chrome DevTools Network 面板渲染的一致性
- 为表单和 multipart Payload 添加更完整的编辑器
- 在 Chrome 暴露更多信息时保留更完整的 initiator/source 元数据
- Release 自动化稳定后增加已签名的商店发布包

可在 [open issues](https://github.com/WAY29/Resender/issues) 查看计划功能和已知问题。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 贡献

1. Fork 本项目
2. 创建功能分支：`git checkout -b feat/my-change`
3. 使用 Conventional Commits 规范提交修改
4. 运行 `npm run test`、`npm run typecheck` 和 `npm run build`
5. 推送分支并创建 Pull Request

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 许可证

本项目基于 GNU General Public License v3.0 分发。更多信息见 [LICENSE](LICENSE)。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 联系方式

项目地址：[https://github.com/WAY29/Resender](https://github.com/WAY29/Resender)

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 致谢

- [Best README Template](https://github.com/othneildrew/Best-README-Template)
- Chrome DevTools Network 面板
- Chrome Extensions 文档

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>
