# dev 自动构建

推送任意提交到 `dev` 后，GitHub Actions 的 **Dev Android** 工作流自动执行：

1. 使用 Node.js 22、`npm ci` 安装锁定依赖，并通过 `patch-package` 应用原生补丁。
2. 运行全部 Jest 单元测试，上传覆盖率报告；测试失败时停止构建。
3. 使用 Java 17 和仓库 Gradle Wrapper 构建 `localTest` APK，包含 JS/Hermes，无需连接 Metro。
4. 上传各 CPU 架构 APK、通用 APK 和 `SHA256SUMS.txt`，保留 30 天。

## 下载 APK

进入仓库 **Actions → Dev Android → 成功的运行 → Artifacts**，下载 `MusicFree-dev-运行编号` 并解压。不确定手机架构时安装文件名含 `universal` 的 APK。

测试包使用仓库的 debug 签名，应用 ID 为 `fun.upup.musicfree.localtest`，可与正式版并存。自动构建不需要配置 Secrets，也不会创建 GitHub Release。

连续推送时，同一分支的旧运行自动取消，以最新提交为准。工作流也支持通过 `gh workflow run build-dev.yml --ref dev` 手动重跑。

## 本地复现

```sh
npm ci
npm test -- --ci --runInBand --coverage
cd android
bash ./gradlew :app:assembleLocalTest --no-daemon --build-cache --stacktrace --max-workers=2
```

Windows 下使用 `gradlew.bat` 替代 `bash ./gradlew`。需要 Android SDK 35、Build Tools 35.0.0 和项目指定的 NDK。

正式发布仍使用 `assembleRelease` 和本地 `android/keystore.properties` 中的发布签名；缺少签名时明确报错，避免生成误用 debug 签名的正式包。

配置参考 [GitHub Actions 工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) 和 [Gradle 官方 setup-gradle 文档](https://github.com/gradle/actions/blob/main/docs/setup-gradle.md)。官方 Actions 固定到完整提交 SHA，并仅授予仓库读取权限。