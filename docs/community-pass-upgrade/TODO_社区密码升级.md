# TODO_社区密码升级.md

> **精简待办清单**：按顺序一条条做，每做完一条删掉/标成已完成即可。部署相关命令只需要在 Windows PowerShell 里运行（项目根目录：`d:\TRAE\cengfan-deploy`）。

---

## ⭐ Part 1 · 马上要做的 5 件事（5~30 分钟）

### ✅ TODO 1：先给所有同学**批量分配初始密码**，并记录下来（关键中的关键！）

1. 部署完成或本地启动后，打开 **管理员 → 🔑 密码管理** Tab。
2. 顶部绿条会显示「缺密码 X 人」，点击 **🗝️ 批量补全密码（X 人缺失）**，确认。
3. 列表里出现的每一行密码，默认是 `******`，逐个点 **👁️ 显示** → **📋 复制** → 粘贴到**私下使用**的 Excel / 飞书多维表格（列：姓名 · 学校 · 密码）。
4. 通过**线下 / 微信私聊 / 飞书私聊**等方式把各自的 6 位密码单独发给同学。

> ⚠️ **不要把整份密码名单公开到群里！** 密码是实名制发言/社区/私信管理员的身份凭证。

### ✅ TODO 2：重置管理员默认密码（当前写死 `I_LV_WHC`）

当前密码写在两个地方：
- [EntryPage setup](file:///d:/TRAE/cengfan-deploy/index.html) `ADMIN_PASSWORD`
- [MainPage setup](file:///d:/TRAE/cengfan-deploy/index.html) `ADMIN_PASSWORD`

**推荐升级路径（更安全，TODO 级别中等）**：
- 在 `netlify.toml` 里新增 build 环境变量 `[build.environment]` 或 Netlify 控制台填 `ADMIN_PWD`；
- 两个 Vue 组件改成 `import.meta.env.VITE_ADMIN_PWD` 或 `process.env.ADMIN_PWD` 读取（当前项目是原生 CDN Vue3，没有构建步骤，所以直接**替换两处常量字符串**即可）。

最简单做法：直接 Ctrl+F 把 `I_LV_WHC` 全局替换成你自己的强密码。

### ✅ TODO 3：本地上机跑一遍「6 条高频 E2E 验证路径」（复制 ACCEPTANCE.md 的步骤）

从 [ACCEPTANCE_社区密码升级.md 第四节](file:///d:/TRAE/cengfan-deploy/docs/community-pass-upgrade/ACCEPTANCE_社区密码升级.md) 第 4 节 6 条步骤一条条执行：

1. 管理员批量补密码 + 记录
2. A 创建社区 → 管理员通过
3. B 申请加入 → 社长 A 通过
4. A 退社 → 自动转让 B 为新社长 → A 仍在社内
5. A 留言 → 显示 `✅ A + 🏛️ 篮球社`
6. A 退出登录再留言 → 显示 `🎭 匿名校友`

全部通过可以直接上线。

---

## ⭐ Part 2 · 部署相关配置（如尚未部署到 Netlify）

### TODO 4：第一次部署的 Netlify 配置检查

1. `netlify.toml` 里已有 13 条新的 redirects，部署时**不需要**改；
2. 把项目推到 GitHub 仓库 → Netlify 控制台选"Add new site" → 选仓库 → 基础设置不用改（build command 留空就行，因为 `index.html` 是纯静态）；
3. 在 Netlify → Site settings → Environment variables 里**建议配置以下变量（可选，代码里有兜底常量，不配也能用）**：
   - `GITHUB_TOKEN`：必配，写文件到 data/*.json 需要 Personal Access Token（repo 权限）；
   - `GITHUB_REPO`：必配，格式 `owner/repo`；
   - `GITHUB_BRANCH`：建议配，默认 `main`；
   - `ADMIN_SALT`：可选（对应 `students.js` / `messages.js` 的 `ADMIN_SALT` 常量）；
   - `STUDENT_SALT`：可选（对应 `student-login.js` 的签名盐）。

> 如果之前已经部署过蹭饭图站点，`GITHUB_TOKEN / REPO / BRANCH` 应该已经在环境变量里了，不用改。

### TODO 5：检查 GitHub Token 过期

Netlify Functions 所有文件写操作靠 `process.env.GITHUB_TOKEN`，Token 一旦过期：
- 学生档案 / 公告 / 留言板 / 社区 / 单聊消息 **全部不能写入**，只能读；
- 报错形如"401 Bad credentials"。
补救：到 GitHub → Settings → Developer settings → Personal access tokens → 重新生成（勾选 `repo` 范围），把新 Token 贴到 Netlify 的 `GITHUB_TOKEN` 环境变量，Redeploy 站点。

---

## ⭐ Part 3 · 可优化可忽略的低优事项

### TODO 6（低优）：把 3 处"硬编码字符串"改成环境变量

出于"**部署零配置也能跑起来**"的原则，这 3 处我都在代码里写了常量兜底，只要部署到没配环境变量的环境也不会挂。
但如果你希望更符合生产规范，建议把下面 3 处都改成 `process.env.XXX || 兜底` 的方式：

| 位置 | 当前写死的常量 | 建议环境变量名 |
| --- | --- | --- |
| `netlify/functions/students.js` / `messages.js` | `ADMIN_SALT = 'I_LV_WHC_ADMIN_SALT_2026'` | `ADMIN_SALT` |
| `netlify/functions/student-login.js` | `STUDENT_SALT = 'I_LV_WHC_STUDENT_SALT_2026'` | `STUDENT_SALT` |
| `index.html` 两处 EntryPage + MainPage | `ADMIN_PASSWORD = 'I_LV_WHC'` | 前端由于 CDN Vue，无构建步骤没法直接读 env → 建议直接 TODO 2 替换字符串，或加 `<script>` 从后端 API 拉是否需要升级密码。 |

### TODO 7（低优）：单聊消息 500 条上限可以再放大

`direct-messages.js` 里的剪枝阈值写死 `MAX_PER_STUDENT = 500`；如果管理员与同学对话量大（例如通知、作业收集），可以把这个常量改大到 1000~2000。

### TODO 8（低优）：补前端单测 / E2E Playwright

当前项目没有任何测试工程（只有 ACCEPTANCE 的人工路径清单）；如果以后要长期迭代，建议增加 Playwright 覆盖 ACCEPTANCE.md 第四节的 6 条路径。

---

## ⭐ Part 4 · 速查：常用 10 个入口在哪里

| 你想做什么 | 入口位置 |
| --- | --- |
| 🔑 给同学发/重置密码 | 管理员 → 🔑 密码管理 |
| 🏛️ 审批谁要创建社区 | 管理员 → 🏛️ 创建社审批 |
| 🎯 审批谁要加入社区 | 管理员 / 社长 → 🎯 加入社审批（社长登录后只看到自己社区的） |
| 👥 看一个社区的成员 / 转让社长 | 管理员 → 🏘️ 社区管理 → 点社区卡片的「👥 社员」按钮 |
| 🗑️ 解散一个社区（**不可恢复**） | 管理员 → 🏘️ 社区管理 → 卡片「🗑️ 删除社区」 |
| 💌 看哪位同学私信了我并回复 | 管理员 → 💌 单聊收件箱 |
| 🚪 我是社员要自己退社 | 主页面顶部身份条 → 🚪 退社 |
| 👑 我是社长要转让 | 管理员 → 🏘️ 社区管理 → 「👥 社员」→ 每个社员行有「👑 转让社长给 TA」 |
| 🎓 同学要自己登录 / 改密码（重置只能管理员做） | 主页面顶部「🎓 同学登录」；密码重置必须找管理员 |
| 📢 发公告 / 置顶 | 管理员 → 公告管理（或点顶部横幅右上角「管理 →」） |

---

## ❓ 出问题怎么自助排查（先看这 3 条，80% 的错误都覆盖）

1. **"所有写操作都提示错误，读数据没问题"** → 90% 概率 `GITHUB_TOKEN` 过期或没配。按 TODO 5 检查。
2. **"同学登录提示姓名或密码不正确"** → 80% 概率管理员还没做 TODO 1（批量补密码），先去补；或同学输错姓名（必须和档案里 nickname **完全一致**，包括大小写和空格）。
3. **"手机顶端公告显示不全"** → 刷新清缓存；已经在 @media 768 断点下强制 `white-space: normal; overflow: visible; word-break: break-word` 完整显示，如果还不完整 → 说明浏览器缓存了旧 CSS，清缓存 / 强刷即可。
