# Alpha.5 外部开放许可实拍验证报告

> 历史快照：本报告保留最初 12 张 Wikimedia cohort 的当时测量，不再描述当前 Beta 1 门禁。当前政策已升级为 16 张 curated open-license camera photographs（四家族 3/3/4/6，20/20 语义结果）；它们满足 Beta 1 照片门禁，但不构成 project ownership 或物理相机/设备验证。当前权威数据见 manifest、validation report、README 与 `docs/benchmark.md`。

## 结论

Wikimedia Commons 外部开放许可实拍 cohort 已建立并通过独立门禁：12/12 张原图保留下载字节，逐张固定 SHA-256、作者、许可、来源页和已核验 payload；人工记录 17 个可见物理实例，并按明确的 `unique-format-payload-gs1` 合同形成 16 个语义结果。真实 ZXing-C++ WASM 全格式多结果解码得到 16/16 个必需结果，false positive 为 0，格式误判为 0。状态为 `PASS_EXTERNAL_OPEN_LICENSE`。

这些图片是第三方开放许可实拍，不是 `project-owned`。在这份 Alpha.5 历史快照形成时，项目自有照片为 0/12，并曾被记录为旧 release 阻塞项。当前 Beta 1 政策已由文首说明取代：project-owned 数量仅作信息记录；尚未完成、仍阻止 Beta 1 release 的是独立实物相机/设备证据，因此没有授权激活 `v2-beta1-r1`。

## 实际门禁

| 指标 | 实际结果 | 状态 |
| --- | ---: | --- |
| external-open-license 原图数量 | 12/12 | PASS（非 release gate） |
| fixture 精确通过 | 12/12 | PASS |
| 可见物理实例 | 17 | 已记录 |
| Ground Truth 结果精确匹配 | 16/16 | PASS |
| Data Matrix 结果召回 | 4/4 | PASS |
| Code 128 / GS1-128 结果召回 | 4/4 | PASS |
| EAN-13 结果召回 | 7/7 | PASS |
| UPC-A 结果召回 | 1/1 | PASS |
| false positives | 0 | PASS |
| 格式误判 | 0 | PASS |
| GS1 语义误判 | 0 | PASS |
| provenance 完整性 | 12/12 | PASS |
| public-repository safety | 12/12 | PASS |
| project-owned 原图 | 0/12 | 历史 Alpha.5 release 阻塞项（当前政策已取代） |

当前 tracked verifier 实测平均 / 中位 / P95 解码延迟为 249.330 / 196.224 / 536.093 ms。延迟是当前机器的 dirty development 证据，不是冻结性能基线；报告同时显式记录 commit、tree、dirty 状态、SDK 和引擎版本。权威原始值和逐图耗时保存在 `validation-report.json`，CI 另行生成 exact-SHA、`repositoryDirty=false` artifact。

## 接受的原图与 Ground Truth

| 原始文件 | Wikimedia 来源页 | 作者 / 许可 | 实际 Ground Truth |
| --- | --- | --- | --- |
| `Intelwireless-datamatrix.jpg` | [来源](https://commons.wikimedia.org/wiki/File:Intelwireless-datamatrix.jpg) | JonLS / Public domain | `data_matrix: 15C06E115AZC72983004` |
| `QR code d'informations à Nice.JPG` | [来源](https://commons.wikimedia.org/wiki/File:QR_code_d%27informations_%C3%A0_Nice.JPG) | Kevin.B / CC BY-SA 3.0 | 3 个 Data Matrix：`5412082001004186`、`5412082001004185`、`5412082001004187` |
| `GS1-128 product barcode.jpg` | [来源](https://commons.wikimedia.org/wiki/File:GS1-128_product_barcode.jpg) | Mike1024 / Public domain | `code_128: (01)27394376616222(15)240212(10)3043AAG`，GS1 |
| `Gardenology.org-IMG 8229 rbgc10dec.jpg` | [来源](https://commons.wikimedia.org/wiki/File:Gardenology.org-IMG_8229_rbgc10dec.jpg) | Raffi Kojian / Gardenology.org / CC BY-SA 3.0 | `code_128: 074107` |
| `Shoe box (2).jpg` | [来源](https://commons.wikimedia.org/wiki/File:Shoe_box_(2).jpg) | jim212jim from Kobe, Japan / CC BY 2.0 | `code_128: B   124RAL      255`；`ean_13: 4534887388723` |
| `Starr 080103-1228 Zingiber spectabile.jpg` | [来源](https://commons.wikimedia.org/wiki/File:Starr_080103-1228_Zingiber_spectabile.jpg) | Forest & Kim Starr / CC BY 3.0 | `code_128: 00019970014934397303`；`upc_a: 763577300149` |
| `Product labeling on a can of air freshener.jpg` | [来源](https://commons.wikimedia.org/wiki/File:Product_labeling_on_a_can_of_air_freshener.jpg) | IIVQ / Tijmen Stam / CC BY-SA 4.0 | `ean_13: 8714774000662` |
| `EAN-13 barcode on a gummy candy package.jpg` | [来源](https://commons.wikimedia.org/wiki/File:EAN-13_barcode_on_a_gummy_candy_package.jpg) | Sokolikmawwer0 / CC BY-SA 3.0 | `ean_13: 4620017455554` |
| `Barcode on food products in Israel 04.jpg` | [来源](https://commons.wikimedia.org/wiki/File:Barcode_on_food_products_in_Israel_04.jpg) | Chenspec / CC BY-SA 4.0 | `ean_13: 7290011126469` |
| `Barcode on food products in Israel 08.jpg` | [来源](https://commons.wikimedia.org/wiki/File:Barcode_on_food_products_in_Israel_08.jpg) | Chenspec / CC BY-SA 4.0 | `ean_13: 7290001491096` |
| `Barcode on food products in Israel 16.jpg` | [来源](https://commons.wikimedia.org/wiki/File:Barcode_on_food_products_in_Israel_16.jpg) | Chenspec / CC BY-SA 4.0 | `ean_13: 7296073293583` |
| `Barcode on food products in Israel 22.jpg` | [来源](https://commons.wikimedia.org/wiki/File:Barcode_on_food_products_in_Israel_22.jpg) | Chenspec / CC BY-SA 4.0 | `ean_13: 7290005437632` |

完整 SHA-256、attribution、retrieval time、许可 URL、原始文件名、物理实例和逐图结果位于 `fixtures/alpha5/external-open-license/manifest.json` 与 `validation-report.json`。多码图片按 `(format, payload, isGs1)` 多重集合精确比较，额外结果、缺失结果、错误 payload、GS1 语义或错误格式都会失败。Zingiber 照片人工记录为 3 个物理实例（1 个 Code 128、2 个同 payload UPC-A）；静态解码 API 按明确合同去重为 2 个语义结果，因此没有用 Decoder 输出反向定义物理 Ground Truth。

## 拒绝与覆盖边界

- `Barcode on food products in Israel 20.jpg`、Kiwi shoe polish 等候选在原图路径上实际解码为 `not-found`，未纳入。
- 超过输入像素上限、只能依赖缩略图、许可不完整或重复度过高的候选未纳入。
- Commons 的 PDF417 候选主要是证件、登机牌、票据、扫描件或生成图；为避免敏感数据和伪实拍，最初 12 张 cohort 不声称 PDF417 外部实拍覆盖。当前 16 张 cohort 已通过固定 ZXing commit 的 Android 相机照片补充 3 张 PDF417，许可与拍摄来源由当前 manifest 单独审计。
- 未使用互联网图片替换 `fixtures/alpha5/project-photos/`，也未把第三方许可图片声明为项目所有。

## 复现

```bash
npm run fixtures:verify-external -- --gate --output=benchmark-results/development/external-open-license-validation.json
npm run fixtures:generate
npm run benchmark:symbologies -- --gate --gate-mode=integration
```

Historical Alpha.5 note: external open-license photographs were not treated as project-owned release evidence. Under the current Beta 1 policy, project ownership is informational and physical-camera/device execution remains the independent release gate.
