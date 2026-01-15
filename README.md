# CoolAuxv

**网页翻译与深度解读工具 | 支持 GLM-4 等推理模型**

[![GitHub Source](https://img.shields.io/badge/GitHub-Source-black?logo=github)](https://github.com/CoolestEnoch/CoolAuxv)
[![Install TamperMonkey](https://img.shields.io/badge/Install-TamperMonkey-green)](https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/translator.user.js)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)


# [👉👉👉 立即安装 / INSTALL 👈👈👈](https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/translator.user.js)

## 📖 简介

**CoolAuxv** 是一款基于油猴（Tampermonkey）的网页辅助脚本。

它对接了 GLM-4.5 等大语言模型，主要用于辅助阅读外文文献。除了基础的翻译功能外，它利用大模型的推理能力，提供对专业术语、复杂长难句的深度解读和背景分析。


![demo](res/translator_pc_screen_understanding.png)
![demo](res/translator_pc_main.png)


## 完美兼容 Android 系统！！！
脚本适配了移动端浏览器的触控操作（推荐使用 Firefox for Android 或 IronFox）。
*   支持触摸拖拽选区。
*   界面自适应手机屏幕宽度。

![demoAndroidFirefoxPhone](res/translator_android_firefox_phone.jpg)


---

## 💻 功能特性

### 1. 深度阅读辅助
*   **翻译模式**：基础的中外互译功能。
*   **解读模式**：不仅翻译，还会对文本中的专业概念进行展开解释，适合学术和专业场景。
*   **推理可视化**：支持显示推理模型（Reasoning Models）的思维链（Chain of Thought），思考过程可见。

### 2. 屏幕视觉分析
*   **一键识屏**：支持截取网页特定区域（如图表、公式）并发送给多模态大模型进行分析。
*   **选区交互**：提供类似系统截图的框选体验，支持空格/回车快捷键确认。
*   **滚动修正**：针对长网页滚动后的截图偏移问题，提供了实验性的修正算法（需在设置中开启）。

### 3. 渲染与排版
*   **Markdown 支持**：支持渲染代码块、粗体、列表等格式。
*   **公式渲染**：内置 KaTeX 引擎，可正确显示 LaTeX 数学公式和矩阵。
*   **流体玻璃 UI**：提供可选的界面美化设置，开启后主窗口和控件背景将应用高斯模糊效果。

---

## 🛠️ 使用说明

1.  **安装**：
    *   PC 端：Chrome/Edge 安装 Tampermonkey 扩展。
    *   Android 端：Firefox 安装 Tampermonkey 扩展。
    *   点击 **[这里](https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/translator.user.js)** 安装脚本。
2.  **配置 Key**：
    *   脚本使用智谱 AI 的 API，需自行前往 [智谱开放平台](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) 申请 API Key。
    *   在网页选中文本 -> 点击“译”图标 -> 进入设置 -> 填入 Key。
3.  **操作**：
    *   **文本分析**：划选网页文本后点击悬浮图标。
    *   **图片分析**：点击面板上的“📷 识屏”按钮进行截图。

## ⚙️ 常见问题 (Q&A)

*   **Q: 截图时选区位置不对，或者截取的是页面顶部的内容？**
    *   A: 这是由于浏览器滚动造成的坐标偏移。请进入脚本设置，在“实验性功能”中勾选 **“使用新截屏算法”**，该模式会先冻结全屏再裁切，可解决此问题。
*   **Q: 公式显示为乱码或代码？**
    *   A: 请确保网络能正常加载 KaTeX 资源文件（脚本会自动引入 CDN 资源）。
*   **Q: 界面背景是纯白色的？**
    *   A: 默认关闭特效。如需磨砂效果，请在设置中勾选 **“开启窗口流体玻璃 (Blur Glass)”**。

## 🔗 开源协议

本项目遵循 GPL-3.0 协议开源。
👉 [https://github.com/CoolestEnoch/CoolAuxv](https://github.com/CoolestEnoch/CoolAuxv)
