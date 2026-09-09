# 商店素材

以下素材于 2026-09-09 生成。三张截图来自实际扩展界面，主页面、模型地址和回答均为明确标注的合成演示数据，不含真实用户对话或 API 密钥，也不代表真实 ChatGPT 或模型接口验收通过。

| 文件 | 用途 | 尺寸 |
| --- | --- | --- |
| `store-side-chat-answer.png` | 独立追问和回答记录 | 1280×800 |
| `store-attachment-consent.png` | 逐项选择本次发送的附件 | 1280×800 |
| `store-settings-disclosure.png` | 接口配置和数据说明 | 1280×800 |
| `promo-440x280.png` | 小型宣传图；RGB，无透明通道 | 440×280 |
| `promo-440x280.svg` | 宣传图可编辑源文件 | 440×280 |

商店图标使用 `public/icons/icon-128.png`。提交前还需在真实 ChatGPT 页面验收最终生产包，并核对素材与该版本一致。

## 重新生成

在仓库根目录运行 `npm run e2e`。附件与停止生成测试会把原始截图写入 `test-results/side-chat-attachments-requ-7f625-m-preserves-partial-history/`；检查后将三张 `store-*.png` 复制到本目录。截图没有裁切、拼接或后期修改。

E2E 使用专用接口权限，运行后必须执行 `npm run package`，重新生成可发布的生产包。

宣传图使用仓库已有图标配色和原生 SVG 绘制。修改 SVG 后，在仓库根目录运行：

```sh
node --input-type=module -e 'import sharp from "sharp"; await sharp("docs/store-assets/promo-440x280.svg").flatten({background:"#ffffff"}).removeAlpha().png().toFile("docs/store-assets/promo-440x280.png")'
```
