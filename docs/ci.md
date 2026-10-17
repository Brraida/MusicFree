# dev 自动构建

推送任意提交到 `dev` 后，GitHub Actions 的 **Dev Android** 工作流自动执行：

1. 使用 Node.js 22、`npm ci` 安装锁定依赖，并通过 `patch-package` 应用原生补丁。
2. 运行全部 Jest 单元测试，上传覆盖率报告；测试失败时停止构建。
3. 读取仓库的发布签名 Secrets，检查 Base64 格式、密钥库密码、私钥别名，并拒绝使用仓库 debug 密钥。
4. 使用 Java 17 和仓库 Gradle Wrapper 执行 `assembleRelease`，打入 JS/Hermes。
5. 使用 Android 官方 `apksigner` 校验每个 APK，并确认签名证书与上传的发布密钥一致。
6. 上传各 CPU 架构 APK、通用 APK、`SHA256SUMS.txt` 和公开证书指纹 `SIGNING_CERT_SHA256.txt`，保留 30 天。

## 发布签名 Secrets

在仓库 **Settings → Secrets and variables → Actions** 分别配置：

| Secret | 内容 |
| --- | --- |
| `RELEASE_KEYSTORE_BASE64` | 实际发布密钥库文件的 Base64 编码，不是 properties 文件或文件路径 |
| `RELEASE_STORE_PASSWORD` | 密钥库密码 |
| `RELEASE_KEY_ALIAS` | 私钥别名 |
| `RELEASE_KEY_PASSWORD` | 私钥密码 |

工作流通过环境变量读取 Secrets，生成仅本次运行使用的密钥库和 Java properties 文件，不在日志中打印它们。构建完成或失败后均删除私密文件；上传范围只包含 APK、校验文件和公开证书指纹，不包含密钥库或密码。缺少或无效的签名配置会使构建失败，不回退到 debug 签名。

## 下载 APK

进入仓库 **Actions → Dev Android → 成功的运行 → Artifacts**，下载 `MusicFree-release-运行编号` 并解压。不确定手机架构时安装文件名含 `universal` 的 APK。

发行包使用你自己的发布签名，应用 ID 为 `fun.upup.musicfree`。覆盖升级需要签名匹配并满足版本要求；之前的 `fun.upup.musicfree.localtest` 测试包是独立应用。

工作流只上传构建产物，不自动创建 GitHub Release。连续推送时，同一分支的旧运行自动取消，以最新提交为准。

## 本地复现

在本地 `android/keystore.properties` 配好发布密钥和密码后：

```sh
npm ci
npm test -- --ci --runInBand --coverage
cd android
bash ./gradlew :app:assembleRelease --no-daemon --build-cache --stacktrace --max-workers=2
```

Windows 下使用 `gradlew.bat` 替代 `bash ./gradlew`。需要 Android SDK 35、Build Tools 35.0.0 和项目指定的 NDK。仅本地测试可继续执行 `assembleLocalTest`，其独立应用 ID 和 debug 签名保持不变。

配置参考 [GitHub Actions 工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)、[Secrets 使用说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)、[Gradle 官方 setup-gradle 文档](https://github.com/gradle/actions/blob/main/docs/setup-gradle.md) 和 [Android apksigner 文档](https://developer.android.com/tools/apksigner)。官方 Actions 固定到完整提交 SHA，并仅授予仓库读取权限。
