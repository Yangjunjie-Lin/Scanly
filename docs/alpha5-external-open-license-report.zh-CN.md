# Alpha.5 外部开放许可实拍验证报告

## 结论

本次检出的可访问原始素材数为 0。当前 checkout、用户下载目录及 Codex 附件暂存目录中均未找到所述 12 个原始文件；Wikimedia 元数据可以核验，但原图 CDN 在本次执行期间返回 HTTP 429。为避免把缩略图、重编码副本或另行搜索的候选图片冒充用户提供的原件，本次没有接受或提交任何照片。

外部 cohort 状态为 `BLOCKED_EXTERNAL_ASSET_INPUT`。项目自有照片仍为 0/12，Alpha.5 最终状态保持 `BLOCKED_REAL_PHOTO_INPUT`；未生成 Alpha.5 final canonical evidence，也未激活 `v2-alpha5-r1`。

## 接受与拒绝文件

| 分类 | 数量 | 文件 |
| --- | ---: | --- |
| 接受 | 0 | 无 |
| 拒绝 | 0 | 无可访问原件，因而未对具体文件作接受或拒绝判定 |
| 待输入 | 12 | 用户所述原件未出现在可访问文件系统中 |

## 实际码制、payload 与敏感数据

没有可访问原件，因此没有可报告的 Scanly 实际解码格式或 payload，也没有对具体文件作敏感数据结论。未知 payload 保持为 `null`，未推测或编造。PDF417 原件在进入公开仓库前仍必须逐张全格式解码；任何包含个人或敏感解码信息的图片必须拒绝。

## 许可与署名

| 文件 | Wikimedia 来源页 | 作者 | 许可 | 署名 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 无 | 无可访问原件 | - | - | - | 待输入 |

接入契约要求保留原许可，不得把第三方文件声明为项目所有；CC BY、CC BY-SA 等文件必须逐项保留作者、许可 URL 和 attribution，ShareAlike 要求不得弱化。

## externalOpenLicenseRealWorld benchmark

| 指标 | 结果 |
| --- | ---: |
| fixture 数 | 0 |
| 已知 payload 精确召回 | 无分母 |
| 未知 payload 检测召回 | 无分母 |
| 分格式召回 | 各格式均无分母 |
| 格式误判 | 0 |
| false positives | 0 |
| 平均 / 中位 / P95 延迟 | 0 / 0 / 0 ms（无样本） |
| provenance 完整性 | 无分母 |
| public-repository safety | 无分母 |
| `externalOpenLicenseCorpusCount >= 12` | 未通过（0/12，非 release gate） |

## 剩余项目自有照片要求

仍需至少 12 张真实项目自有照片：Data Matrix、PDF417、Code 128 / GS1-128、EAN / UPC 四个主要家族各至少 3 张。它们必须由项目拥有或由仓库所有者真实拍摄，并满足现有总体召回、分家族召回、格式误判、false-positive、GS1 与校验位 release gates。

External open-license photographs provide third-party real-world validation but do not satisfy the project-owned photograph release gate.
