# 上传 GitHub 并发布试玩页

项目已上传至 [Baolilinglan/bicycle-simulator](https://github.com/Baolilinglan/bicycle-simulator)，并通过 GitHub Pages 发布：[在线试玩](https://baolilinglan.github.io/bicycle-simulator/)。现有项目更新请直接使用下文“以后更新”的三条命令；创建新仓库时才需要执行初次配置。

## 1. 创建一个空仓库

登录 GitHub，点击右上角 **＋ → New repository**。

- 仓库名可以用 `bicycle-simulator`。
- 想使用免费 GitHub Pages，选择 **Public**。
- 此处不要勾选自动生成 README、.gitignore 或许可证，因为本地已有项目文件。
- 点击 **Create repository**，复制页面中的 HTTPS 仓库地址。

## 2. 上传这份项目

在 Windows PowerShell 中逐行运行。将下面的 `你的用户名` 换成真实 GitHub 用户名；如果用了其他仓库名，也要修改地址。

```powershell
cd D:\zxc
git init
git add .
git commit -m "Add manual bicycle simulator"
git branch -M main
git remote add origin https://github.com/你的用户名/bicycle-simulator.git
git push -u origin main
```

首次推送时，按照 Git Credential Manager 弹出的浏览器窗口登录 GitHub。如果提交提示缺少身份，先设置自己的姓名与邮箱，再重新执行 `git commit`：

```powershell
git config user.name "你的名字"
git config user.email "你的 GitHub 邮箱"
```

`.gitignore` 已排除 `node_modules`、`dist`、测试截图、Blender 备份和环境配置。需要上传的内容包括 `src`、`public`、`assets/rider`、配置文件、锁文件和 `.github/workflows/pages.yml`。Blender 源文件是原创资产，已保存在 `assets/rider/commuter.blend`。

## 3. 开启网页发布

1. 打开仓库 **Settings → Pages**。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**。
3. 打开仓库的 **Actions → Publish bicycle simulator**。
4. 点击 **Run workflow → main → Run workflow**。初次推送发生在 Pages 尚未开启之前时，第一次自动运行可能失败，开启后手动运行即可。
5. 等待 `build` 和 `deploy` 都显示绿色。部署结果会给出实际访问地址，通常是 `https://你的用户名.github.io/bicycle-simulator/`。

别人访问这个 HTTPS 链接即可试玩，不需要安装 Node 或 Blender。手机请横屏，触屏控制会自动出现。

以后更新只需要：

```powershell
git add .
git commit -m "Update simulator"
git push
```

推送到 `main` 后，工作流自动测试、构建并更新试玩页。无需手动上传 `dist`。

## 本地预览与模型修改

```powershell
npm run dev
npm run build
npm run preview
```

模型可以在 Blender 中直接打开 `assets/rider/commuter.blend` 编辑。项目附带可重复生成的建模脚本。重新生成和压缩：

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python assets/rider/build_rider.py
npm run model:optimize
npm run model:validate
```

运行时使用 `public/models/rider.glb`，无需将 Blender 安装到服务器。手动改变骨骼名称或绑定姿态时，要同步更新 `assets/rider/rest-pose.json` 和 `src/render/rider.ts`。

参考：[GitHub 官方上传本地项目指南](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)、[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
