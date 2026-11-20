# 发版流程

第一次公开发布的完整步骤。之后每次发版照着这份走。

> **当前状态**：版本 `0.9.0`，代码已提交但**尚未推送**，npm 上**还没有这个包**，
> 仓库里**没有** GitHub Actions 工作流 —— 所以**首次发布必须手动执行**。

## 0. 发版前：这些必须已经就位

| 项 | 状态 |
|---|---|
| `package.json` 的 `version` / `description` / `engines` / `files` / `publishConfig` | ✅ |
| `LICENSE`（MIT 正文 + 第三方归属） | ✅ |
| `CHANGELOG.md`（本版本的条目） | ✅ |
| `README.md`（门面 + 徽标 + 图） | ✅ |
| `npm view dsh-realtime-interview` 返回 404（包名未被占用） | ✅ |
| `node scripts/build.mjs` 全绿 | ✅ |
| `node --test tests/*.test.js` 全绿 | ✅ |

## 1. 先推代码（顺序很重要）

```bash
cd D:\Code\Node\HASEE-DSH-INTERVIEWER-ROOT\dsh-realtime-interview
git push -u origin main
```

**为什么必须先推。** README 里的图、徽标、文档链接**全部指向
`raw.githubusercontent.com/LiangshouX/dsh-realtime-interview/main/...`**，
而 npmjs.com 的页面就是拿这份 README 渲染的。先发 npm 再推代码，
npm 页面上的图会全是 404。推完 GitHub 侧还会自动生效三件事：
LICENSE 被识别为 MIT、仓库的 social preview 用 README 首图、`main` 分支可被引用。

## 2. GitHub 仓库的元信息（网页上，三十秒）

- **Settings → General → Description**：一句话说明这个插件是什么。
- **Settings → General → Topics**：填这一组（找插件的人靠它搜）：
  ```
  deepseek-harness  dsh  dsh-plugin  interview  mock-interview
  job-interview  voice  asr  tts  camera  chinese
  ```
- license 不用管——第 1 步推上去之后 GitHub 会自动识别成 MIT。

## 3. 登录 npm

```bash
npm whoami
```

没登录（401）就二选一：

**A. 浏览器登录（最省事）**

```bash
npm login
```

浏览器里授权，回终端即完成，凭据写进用户级 `~/.npmrc`。

**B. 令牌（适合 CI / 想让两台机器共用）**

1. npmjs.com → 右上头像 → **Access Tokens → Generate new token → Granular/Automation token**
2. 勾选 **Read and write**；包范围限定到 `dsh-realtime-interview`
   （**Automating token** 这一类只能在 CI 用，不能交互式发布）
3. 把令牌写进**用户级** `~/.npmrc`（**不是仓库里的**）：

   ```ini
   //registry.npmjs.org/:_authToken=npm_xxxxxxxxxxxx
   ```

> ⚠️ 仓库里**不要**建 `.npmrc`。本仓库现在没有、`.gitignore` 里也没有它——
> 真需要加的话，把 `*.npmrc`（但放行 `!/.npmrc`）加进 `.gitignore` 再建。

## 4. 发布前最后确认（在**仓库根目录**，不要在 tarball 里）

```bash
npm whoami                       # 身份对不对
npm pack --dry-run                # 看看将要上传什么（应约 113 个文件 / 2.8 MB）
node scripts/build.mjs            # 闸门
node --test tests/*.test.js       # 229 个测试
```

> **在仓库根目录发，不要在 `node_modules` 的副本里发**——那里没有
> `src/client/` 与 `scripts/`，发出去会是一个**残缺的包**。

## 5. 发布

```bash
npm publish
```

- `prepublishOnly` 会自动跑一遍 `node scripts/build.mjs`（语法 + SSR 冒烟 +
  性能 + 布局闸门）。**闸门红 = 发布中止**，这是故意的。
- `build/` 是 gitignore 的，所以这一步同时保证包里**有** `build/skills/`——
  没有它，插件会装上但**两个技能都不存在**。
- 未加 scope 的包默认就是公开的，`--access public` 是多余的
  （`package.json` 的 `publishConfig.access` 已经生效）。

**首次发布可能撞上的两个坑：**

| 报错 | 怎么办 |
|---|---|
| `You must verify your email before publishing` | 去注册邮箱点 npm 的验证链接，再发一次 |
| `similar name to an existing package` | npm 的防撞名机制。撞上只能改名（例如 `dsh-mock-interview`）——**先发先占**，现在名字还是 404 |

## 6. 验证

```bash
npm view dsh-realtime-interview              # 版本 / 描述 / engines / dist
npm view dsh-realtime-interview dist-tags
npm dist-tag ls dsh-realtime-interview
```

浏览器打开 <https://www.npmjs.com/package/dsh-realtime-interview>，
确认：徽标在、图出来了（raw.githubusercontent 的图需要第 1 步已推）、README 排版正常。

## 7. 打 tag + 发 GitHub Release

```bash
git tag -a v0.9.0 -m "v0.9.0 — 面试间首次公开发布"
git push origin v0.9.0
```

GitHub 上：**Releases → Draft a new release → 选 v0.9.0** → 把
`CHANGELOG.md` 里 0.9.0 那段粘进正文 → **Publish**。

## 8. 端到端验一遍（从 npm 装，而不是从本地 tarball）

```bash
mkdir -p "$env:TEMP\iv-check" && cd "$env:TEMP\iv-check"
npm init -y
npm install dsh-realtime-interview --ignore-scripts
node -e "import('dsh-realtime-interview').then(m=>console.log('OK',Object.keys(m).join(',')))"
```

期望输出 `OK apply,inject,name`。

## 9. 进 DSH 插件市场

给 `awesome-dsh-plugin/awesome-dsh-plugin` 提一个 PR：加**一个文件**
`data/plugins/LiangshouX__dsh-realtime-interview.yml`，内容见 `docs/MARKET.md`。

## 10. 回滚预案

| 情况 | 动作 | 备注 |
|---|---|---|
| 刚发 72 小时内、还没有人依赖 | `npm unpublish dsh-realtime-interview` | 首次发布没有依赖者，撤得干净 |
| 已经有人装了 | `npm deprecate dsh-realtime-interview "…"`，再发 0.9.1 | 保留可安装，只在安装时警告 |
| 想把 `latest` 挪走 | 发 0.9.1 到 `latest` | **别** `npm dist-tag rm … latest`——会让新用户直接装不上 |
| 72 小时以后 | 撤不掉了，只能 `deprecate` + 发补丁 | 这是 npm 的硬规矩 |

---

## 以后：把手动发布变成一条命令

首次发布不会「自动」——仓库里**没有** GitHub Actions 工作流，npm 那边也
**没有**配 trusted publisher，而且连仓库的 license/topics/description 都还是空的。
但值得配，因为配完之后每次发版就是「打 tag → 自动发布」：

1. npmjs.com → **Settings → Trusted Publishers → Add a new trusted publisher**
   → GitHub，填 `LiangshouX/dsh-realtime-interview`，workflow 填
   `release.yml`，environment 留空。
   这样**不用存任何 token**，npm 用 OIDC 换一次性凭据。
2. 建 `.github/workflows/release.yml`：

   ```yaml
   name: release
   on:
     push:
       tags: ['v*']
   jobs:
     publish:
       runs-on: ubuntu-latest
       permissions:
         id-token: write        # OIDC 换凭据要这个
         contents: read
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, registry-url: 'https://registry.npmjs.org' }
         - run: npm ci
         - run: node scripts/build.mjs
         - run: npm publish --provenance
           env:
             NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}   # 用 trusted publisher 时这行可省
   ```

   （用了 trusted publisher 就不需要 `NPM_TOKEN`；`npm publish --provenance`
   会附上溯源证明，npm 页面会显示 provenance 徽标。）

3. **注意**：`npm ci` 需要 `package-lock.json` 或 `pnpm-lock.yaml`——
   本仓库用的是 **pnpm**（`pnpm-lock.yaml`），所以那一步要换成
   `pnpm install --frozen-lockfile`。
