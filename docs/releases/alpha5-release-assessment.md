# Scanly SDK v2 Alpha.5 发布评估

评估日期：2026-08-06（Asia/Shanghai）  
评估对象：`architecture/sdk-v2-alpha5-multisymbology-foundation`  发行候选版本：`2.0.0-alpha.5`

## Final Alpha.5 integration result

本节是当前权威状态，并取代下方合并前审计中的仓库状态描述。

| 项目 | 最终值 |
| --- | --- |
| Final PR head | `0aa809bda007783d0858b08d07f9a36902dd3471` |
| Merge commit | `b0fd251996690fef80909cf972dc28a18e5e2207` |
| Final integration branch | `develop/sdk-v2` |
| Final branch-consolidation commit | `5b7f023a7f8efb4ad85f60a8affb076ba24dfd41` |
| PR #9 | **merged**, not Draft, source branch deleted |
| Alpha.5 integration | **GO** |
| Alpha.5 release | **NO-GO** |
| Project-owned photographs | **0/12**, deferred to Beta 1 |
| Last frozen evidence | **Alpha.4 r4** (`v2-alpha4-r4`) |

Alpha.5 will not be retroactively released. No `v2-alpha5-r1` activation is required. The next eligible frozen evidence family is `v2-beta1-r1`.

## Historical pre-merge audit — superseded by final integration closure

以下内容保留为历史审计记录，反映 PR #9 合并前的精确状态。它已被上方 final integration result 取代，不得用作当前分支、PR 或 CI 状态。

### Historical decision

**ALPHA5_INTEGRATION_GO / ALPHA5_RELEASE_NO_GO**

PR #9 的 Alpha.5 多符号基础接受合并到 `develop/sdk-v2`，前提是所有非照片质量门禁通过。项目自有真实照片当前为 `0/12`，四个格式族均为 `0/3`，因此物理相机验证明确记为 `DEFERRED_TO_BETA1`。这项集成豁免不改变严格发布模式：不创建 `v2.0.0-alpha.5` tag，不创建 GitHub Release，不发布 npm 包，不激活 Alpha.5 canonical evidence，也不作 Stable/生产认证声明。

> Alpha.5 is accepted as the consolidated multi-symbology development foundation. Project-owned real-photo and physical-camera evidence are deferred to Beta 1. No Alpha.5 tag, GitHub Release, npm publication, or Stable claim is authorized.

### Historical source and repository state

| 项目 | 实际值 |
| --- | --- |
| Repository remote | `https://github.com/Yangjunjie-Lin/Scanly.git` |
| Branch | `architecture/sdk-v2-alpha5-multisymbology-foundation` |
| Base | `develop/sdk-v2` |
| Source Commit under test | `b1b0d1949500a136560d98436e51a335b35c9cd0` |
| Source Tree | `dbb25089c09b99e15a769a83973bf8d96ce3d671` |
| Ahead/behind `origin/develop/sdk-v2` | `13 ahead / 0 behind` before merge |
| Local tracked diff | clean |
| Local untracked state | 13 个 `.alpha5-*` 审计临时日志；未纳入发布提交 |
| SDK version | `2.0.0-alpha.5` |
| WASM SHA-256 | `6a858c01e076bab3a1bd413e4f2cf5e5e45f819a0d9441d83c66993bc48ed38f` |
| `package-lock.json` SHA-256 | `b21740e7ee0dc27c8cedd16b6fbe46d805e0eb6723c19b966388b30805be1f4b` |
| Alpha.5 manifest SHA-256 | `847692502858e6ba4a2f3cfca8840856f6637d4bff14d63b88617bc39d97ba85` |

审计开始时，本地 `git pull --ff-only` 成功，而远端分支为 `78266777dfba3e4f294d03c3e8dd764085f91a88`；该旧 SHA 的检查没有被复用。随后 hardening 和评估提交已推送。PR #9 保持 OPEN、Draft、base `develop/sdk-v2`、mergeable；没有标记 Ready，也没有合并。

### Historical project-photo audit

实际检查了：

- `fixtures/alpha5/project-photos/`：只有 `README.md` 和 `manifest.json`，没有 `.jpg`、`.jpeg`、`.heic`、`.heif`、`.webp` 或其他照片文件；
- `fixtures/alpha5/project-photos/manifest.json`：schema `2.0-alpha5-project-photos`，`fixtures: []`；
- `fixtures/alpha5/manifest.json`：只包含 `sourceType: generated` 的 146 条记录，没有 `sourceType: project-photo` 条目。

| 照片族 | 实际项目照片 | 强制最少数 | 结果 |
| --- | ---: | ---: | --- |
| Data Matrix | 0 | 3 | FAILED |
| PDF417 | 0 | 3 | FAILED |
| Code 128 / GS1-128 | 0 | 3 | FAILED |
| EAN / UPC | 0 | 3 | FAILED |
| 总数 | 0 | 12 | FAILED |

Alpha.5 生成语料为 146 条：112 条正例、34 条负例；项目照片为 0，外部开放许可照片为 0。生成器再次运行后报告 `100 single-format, 12 mixed, 34 negative` 且零 drift。生成图片不计入 project-owned real-photo gate。

### Historical Tier A evidence

| Gate | 实际结果 | 状态 |
| --- | --- | --- |
| QR、Data Matrix ECC 200、PDF417、Code 128、EAN/UPC 格式契约及 ZXing-C++ WASM 集成 | 单元/集成测试通过 | PASS |
| QR-only 默认、显式 format mask、格式身份、混合格式 distinct results | 相关单元、Node 和浏览器测试通过 | PASS |
| generated clean | 15/15；各要求格式 recall 100% | PASS |
| generated difficult | 75/85；Data Matrix 90%、PDF417 88.2%、Code 128 90%、EAN/UPC 各 85.7% | PASS |
| mixed-format completeness | 12/12（24/24 exact results） | PASS |
| GS1 maintained fixture recognition | 8/8 | PASS |
| false positives / format confusion / invalid checksum acceptance | 0 / 0 / 0 | PASS |
| format-selection accuracy | 100% | PASS |
| project-owned photo corpus | 0/12；四族均 0/3 | **FAILED** |
| project-photo exact recall | 分母为 0，不能计算；不可假定通过 | **FAILED** |
| Tier A aggregate | symbology gate `21/32`；其余失败均由照片缺失引起（外部语料 gate 为 informational） | **FAILED** |
| exact-SHA remote CI | Public API、WASM Build、multi-symbology unit/integration、package tarball 通过；主 CI canonical evidence、Full Benchmark Symbologies、Firefox Browser Benchmark 失败 | **FAILED** |

维护的旧 QR smoke 在本机为 `10/11`，唯一失败为文档化的 damaged fixture；`false positives=0`、`timeouts=0`。旧的开发 profile 文件曾在远端 SHA `7826677` 记录 Fast `62/74`、Balanced `73/74`、Robust `73/74`，但该 SHA 不是当前 Source Commit，不能冻结或复用为 Alpha.5 证据。

### Historical runtime, package, and reliability checks

以下命令在 Windows x64 / Node `v24.15.0` 本地实际运行并通过：

- `npm ci`（安装后 audit 0 vulnerabilities）；
- `npm run wasm:build`、`npm run wasm:verify`；
- `npm run fixtures:generate`、`npm run scenarios:generate`、`git diff --exit-code -- fixtures scenarios`；
- `npm run workflows:verify`、`quality:static`、`docs:check`、`lint`、`typecheck`；
- `test:unit`（260/260）、`test:symbologies`（29/29）、`test`（315/315）、`test:coverage`；
- `build:packages`、`packages:smoke`、`packages:tarball`（10 个可发布 tarball）、`build:web`；
- `api:snapshot`、`api:diff`；
- `test:e2e`（72/72：Chromium 42、Firefox 15、WebKit 15）；
- `benchmark:smoke`（10/11，保留 documented damaged failure）；
- `benchmark:compare`、`bundle:analyze`；
- `test:wasm:memory -- --iterations=10000`；
- `npm audit --audit-level=high`。

10,000 次 WASM soak 的关键结果：平均 decode `1.170 ms`，线性内存从 `22,282,240` bytes 保持稳定，`activeNativeResultCount=0`、`inputAllocationBytes=0`，dispose 后 `currentLinearMemoryBytes=0`，无初始化/执行失败。

本机对比（Windows x64 / Node 24，74 维护 fixture）记录：

| Profile | Exact recall | Multi completeness | P50 | P95 |
| --- | ---: | ---: | ---: | ---: |
| Fast | 80.95% | 0/9 | 84.5 ms | 414 ms |
| Balanced | 96.83% | 8/9 | 530.5 ms | 1,538 ms |
| Robust | 98.41% | 9/9 | 550.5 ms | 2,200 ms |

这些是开发比较结果，不是 Alpha.5 immutable baseline；没有在本次未冻结的情况下把它们宣传成工业延迟保证。

独立 Windows Firefox browser smoke benchmark 的 7 个 fixture 全部通过（Playwright test 9.4 秒，报告 P95 1,541 ms）。同一 source code 在两次 Ubuntu GitHub runner 的 Firefox Browser Benchmark 中均达到 120 秒 test timeout，未生成报告；Chromium 和 WebKit job 通过。尝试在 Ubuntu 24.04 WSL clean worktree 复现，但 `npm ci`/build 在 Windows 挂载盘上 10 分钟内未完成，因此该本地 Linux 复现标记为 unavailable，不能替代远端失败。

### Historical Tier B industrial-grade evidence

Tier B 不成立。独立真实照片不是 `>=100`，每族不是 `>=25`；holdout 为 0；真实负例不是 `>=100`；没有实体验证的 macOS、Android 浏览器或 iOS Safari 证据；没有 10,000 次之外的 `>=2 小时`持续 Worker/session 证据；没有定义并冻结的多硬件 latency profile；没有本次 Source Commit 对应的 SBOM、离线 bundle、release provenance 或远程完整 Actions 结果。因此不得作 industrial-grade engineering evidence claim。

### Historical failure classification

| 类别 | 结论 |
| --- | --- |
| real-photo recall / dataset coverage | **BLOCKER**：实际照片为 0，四族覆盖和 recall gate 无分母 |
| evidence mismatch | **BLOCKER**：没有 Alpha.5 Source/Evidence Freeze、schema 2.1 Canonical Manifest、`v2-alpha5-r1` active baseline |
| remote CI | **BLOCKER**：`b1b0d19` 修复 manifest 漂移后，PR head `1e3ab07` 的 Full Benchmark `Prepare` 成功、`Symbologies` 因照片 gate 失败；主 CI 因 Alpha.4 canonical manifest 的 SDK/dataset/package-lock/source 不兼容而失败；Firefox Browser Benchmark 两次在 120 秒超时。失败或 pending 均不满足发布条件 |
| device validation / reliability | **BLOCKER for Tier B**：缺少 macOS、Android、iOS 及 2 小时 Worker evidence |
| package installation / supply chain | 本地 tarball 和 audit 通过；SBOM、离线消费者验证和 release hashes 尚未生成，不能视为 release-complete |
| latency | 本机 Balanced/Robust P95 高于工业 profile 的 1,000 ms 总体要求；硬件/use-case profile 尚未冻结，不能宣称 Tier B |
| correctness / false positive / WASM memory | 本次本地 gates 通过；没有证据支持为此进一步放宽门槛 |

`b2f7665` source commit 已包含有界的 format-mask 传播、持久 Worker/WASM 状态复用、tarball 验证和 native memory 释放断言；当前 source commit `b1b0d19` 另修复了 Windows CI 的 manifest 换行漂移：生成内容仅有 CRLF/LF 差异时不再重写文件，真实 JSON 内容变化仍由 `git diff` 门禁拦截。本次没有为掩盖照片证据缺失而修改解码器，也没有删除困难 fixture、放宽负例或改变 checksum gate；在证据输入缺失时继续调参没有可辩护的 before/after 改善。

### Historical permitted and prohibited claims

当前允许声明：**Alpha.5 integration accepted; Alpha.5 release not authorized**。项目自有照片与物理设备证据为 `DEFERRED_TO_BETA1`，不能声明：

- evidence-complete engineering preview；
- industrial-grade engineering evidence passed；
- certified industrial、medical、aviation、automotive 或 regulatory compliance；
- universal device、environment、DPM 或 mobile coverage。

适用限制仍包括：不支持 Aztec、Micro QR、Micro PDF417、DotCode、MaxiCode、GS1 DataBar、DPM-specific mode、native iOS/Android SDK；没有 certified device laboratory 或 regulatory certification；严重曲面和反光金属证据有限。

### Historical required next action (abandoned Alpha.5 release plan)

原合并前计划要求在补齐至少 12 张 project-owned camera photographs 后激活 `v2-alpha5-r1`。该方案是 **historical abandoned release plan**，不再执行。Alpha.5 不会追溯发布，也不需要激活 `v2-alpha5-r1`。真实照片、物理相机与后续 release evidence 工作转入 Beta 1；下一条可用的冻结证据族为 `v2-beta1-r1`。
