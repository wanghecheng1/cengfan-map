# V4 需求对齐文档（ALIGNMENT）

> 任务名：V4_唐榜游客社区升级
> 生成日期：2026-07-30
> 上下文：基于 cengfan-deploy 现有 V3（社区/密码/单聊/6档色号/移动端适配 + 全局Bug修复已完成），用户新增 4 条升级需求。

---

## 一、原始需求原文（4条）

1. **留言板优化发言反馈**：发送之后没反馈很容易多次点击进而导致多次发送，增加发送成功弹窗和申请成功弹窗（创建社区/加入社区申请）。
2. **新增游客入口**：游客入口对比用户入口，基本上一样，但只能看到已加入的同学的姓名首字母，看不到姓名，且不能留言，能看到地图，地图上的个人信息也是姓名首字母缩写（比如 whc），能看到公告。
3. **社区新增单独的完整页面**：不要放在一个小小的角落，且能看到社区成员，社长可以设置副社长。
4. **新增唐榜页面**：每个登录的同学每人每天有 3 次投票机会，投票给已加入社区的同学，动态更新排行榜，就叫唐榜。

---

## 二、现有项目理解

### 2.1 前端架构
- 单页应用 (SPA) 单文件实现：`index.html`（~4788 行）
- 框架：Vue 3 CDN（`cdn.staticfile.org/vue@3.4.21/vue.global.min.js`）+ 原生 `<script>` 全局作用域
- 页面机制：根应用 `currentPage = ref('entry|home|admin')`，computed `currentPageComponent` 切换 `EntryPage|MainPage|AdminPage` 三个组件对象
- 数据层：`DataProvider` 全局对象封装所有 Netlify Functions API，内部 `fetchWithRetry` 三次重试，响应式 store 用 Vue reactive/ref
- UI 样式：纯手写 CSS（内嵌 `<style>`），主题色赭红 #C0392B + 米黄 #FDF6EC，无 UI 库
- 四层全局错误兜底（2026-07-30 新增）：window.onerror + unhandledrejection + Vue errorHandler + Vue warnHandler → 顶栏红框报错

### 2.2 后端架构（Netlify Functions）
现有 10 个函数：
| 函数 | 文件 | 路由前缀 |
|---|---|---|
| 学生档案 CRUD + 密码分配/重置/批量补 + 退社 | students.js | /api/students/* |
| 同学登录（Token 签发） | student-login.js | /api/student-login |
| 留言板 CRUD（Token 实名判定） | messages.js | /api/messages |
| 社区 CRUD + 创建/加入申请审批 + 转让 + 管理员删社/移社员 | communities.js | /api/communities/* |
| 同学-管理员单聊（消息收发/标记已读/轮询列表） | direct-messages.js | /api/direct-messages/* |
| 管理员登录（Token 签发） | admin-login.js | /api/admin-login |
| 公告 CRUD | announcements.js | /api/announcements |
| 待审核名录 CRUD | pending.js | /api/pending |

存储介质：GitHub 仓库 `data/*.json`（students / communities / messages / announcements / pending / community-create-requests / community-join-requests / direct-messages）

### 2.3 关键技术约束（不可违背）
1. **单文件 Vue + CDN**：不得引入构建工具/打包，必须保持 `<script>` 直引 Vue global
2. **Netlify Functions**：新增 API 必须写在 `netlify/functions/*.js`，路由在 `netlify.toml` [[redirects]] 配 `/api/xxx/* /.netlify/functions/xxx 200`
3. **Token 鉴权**：写操作（投票/设副社长）必须带 `X-Student-Token` 头，不能仅靠姓名参数（鉴权方式与 communities.js/students.js 一致：`parseStudentToken` → `verifyStudentAny`）
4. **Vue 组件定义方式**：新增页面必须用 `const XxxPage = { template: \`...\`, setup(props, {emit}) {...} }` 对象，注册到根应用 `currentPageComponent` 的 map 里
5. **不要动现有 AdminPage/MainPage 已稳定功能**：所有修改按 6A 规范做增量改造

---

## 三、边界确认（明确任务范围 ✅ / ❌）

| 功能点 | 是否包含 | 备注 |
|---|---|---|
| 留言板 sendMessage 成功后弹「✅ 发送成功」弹窗（含 emoji，2-3s 自动消失 + 手动确认关闭） | ✅ | 防重复点击：发送中按钮 disabled，加 loading 转圈 |
| 申请创建社区成功弹窗（提示等待管理员审批 + 审批后如何通知） | ✅ | submitCreateCommunity 成功后弹，替换原来的 alert |
| 申请加入社区成功弹窗（提示等待社长同意 + 审批后如何通知） | ✅ | submitJoinCommunity 成功后弹，替换原来的 alert |
| 游客模式：EntryPage 新增第三个大按钮「游客入口」 | ✅ | 位置在用户入口右侧/下方，视觉区别（灰色调） |
| 游客模式：MainPage 同学名录姓名 → 姓名全拼首字母缩写（例：王和成→whc） | ✅ | 地图 tooltip、详情卡、统计卡片、社群归属展示全部首字母 |
| 游客模式：禁用留言板（输入框灰色 disabled + 按钮 disabled + 提示「登录后可发言」） | ✅ | 发布社区/申请创建/申请加入也全部 disabled |
| 游客模式：可以看到完整公告栏、完整地图点分布、完整统计数据 | ✅ | |
| 游客模式：能看到社区列表，但「申请创建/申请加入」按钮灰掉且提示登录 | ✅ | |
| 游客模式：顶栏身份条显示「👥 游客模式」+ 返回入口页按钮 | ✅ | 顶栏还要保留「🎓 同学登录」按钮让游客随时登录升级 |
| 社区独立页：根应用新增 currentPage='community' + CommunityFullPage 组件（完整页面，不是卡片） | ✅ | 包含：社区头图/简介、社长/副社长徽章、成员列表（分页或全部展示）、退出社区/转让社长/设副社长/移出成员操作区、返回首页按钮 |
| 社长设副社长：每个社区 1 个副社长（或多个？待定见§四） | ✅ | 副社长可审批加入申请、可设置头衔、不可转让/删社 |
| 副社长数据结构：students.json 不变 → communities.json 每个社区新增 `deputyOwnerId: number | null` | ✅ | 双写：设置副社长时写 communities.json，并同步 members 列表里的头衔徽章 |
| 唐榜页：根应用新增 currentPage='tang-rank' + TangRankPage 组件 | ✅ | MainPage 顶栏/入口页或底栏加导航 |
| 唐榜页每人每日 3 票：仅已登录且在社区中的同学可投票 | ✅ | 游客/未登录/不在社区 → 显示排行榜但投票按钮灰，提示登录加入社区 |
| 唐榜投票规则：不可投自己，可投同社区或跨社区的任意已在社区同学，每投 1 人扣 1 票，当日 0 点自动重置计数 | ✅ | 后端按日期字符串 `YYYY-MM-DD` 做票仓分片 |
| 唐榜排行榜：按总票数从高到低，显示排名+头像首字母+姓名+所属社区+总票数+投票按钮（剩票时可点） | ✅ | 动态更新：每次投票后无刷新重新拉取排行榜 |
| 唐榜数据存储：data/tang-rank.json（新 JSON，见 DESIGN） | ✅ | |
| 唐榜后端 API：POST /api/tang-rank/vote（投票） + GET /api/tang-rank（取排行榜+当前用户剩余票数） | ✅ | |
| 副社长设职后端 API：POST /api/communities/:id/deputy（设置/取消副社长，仅社长可用，Token 鉴权） | ✅ | |
| 管理员端入口页调整（管理后台 9 Tab 保持不变） | ❌ | 不在本需求范围，如需另开任务 |
| 游客数据持久化、唐榜历史记录/按月统计 | ❌ | 不在本需求范围 |
| 移动端适配（新页面） | ✅ | 新组件加入 @media ≤768px 纵向堆叠布局，沿用 MainPage 现有响应式规范 |

---

## 四、待澄清问题（优先用现有代码模式/行业规范决策，有人员倾向则列出询问）

### ✅ 已自动决策（无需询问，基于现有代码规范）
1. **成功弹窗形式**：沿用现有 `modal-mask / modal-content` 样式体系（EntryPage 管理员登录弹窗同款），新增带 ✅ 绿色对勾大图标的 SuccessModal 可复用组件，加 3s 自动关闭倒计时 + 「好的」手动确认按钮。原因：现有体系已有 transition + shake 动效，复用降低学习成本。
2. **游客模式实现**：不复制 GuestPage（避免 4000 行重复代码），在全局 scope 加 `const isGuestMode = ref(false)`，MainPage 模板/ computed 中加 `v-if="!isGuestMode || ..."` 条件渲染，姓名显示加 computed helper `displayName(s, isGuest)` 自动返回首字母或真名。原因：DRY 原则，后续维护一处改两处生效。
3. **副社长数量**：默认 1 个（数据结构 `deputyOwnerId: number|null`），可在 DESIGN 里声明如需扩展为 N 个只需改字段为 `deputyOwnerIds: []`，接口契约不变。
4. **唐榜重置时间**：北京时间当日 00:00:00，后端用 `new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })` 生成日期分片 key，避免 UTC 时区偏移导致重置错点。
5. **唐榜投票自投防护**：后端强制校验 `voterId !== candidateId`，前端灰掉自己那行的投票按钮。

### ❓ 需用户确认（共 2 个，决策点较重要）
**Q1：社区独立页 & 唐榜页的导航入口放在哪里？**（现在只有 EntryPage 3 个大按钮 + MainPage 顶栏 2 个 action + 右侧信息卡）
> 推荐方案（A）：EntryPage 下方加一排 2 个小按钮「🏘️ 社区大厅」「🏆 唐榜排行」；MainPage 顶栏在「🎓 同学登录」左侧加两个小图标按钮。  
> 方案（B）：MainPage 右侧信息卡最上方加 2 个快捷入口；EntryPage 保持三按钮不变，社区/唐榜从首页进。

**Q2：唐榜显示范围？**
> 推荐方案（A）：显示 **所有已加入社区的同学**（跨社区，总榜），票数从 V4 上线日起累计（不回溯历史）。  
> 方案（B）：仅显示当前用户所在社区内部排行 + 另设一个「全站总榜」Tab。

---

## 五、项目与 V4 任务关键特性规范（对齐 V3 已稳定代码模式）

| 维度 | V3 既有约定 | V4 必须遵循 |
|---|---|---|
| 页面路由 | `currentPage ref('entry\|home\|admin')` + map 切换 | 新增 `'community'/'tang-rank'` 到 map，组件名 CommunityFullPage / TangRankPage |
| 身份鉴权 | 同学写操作 → `needStudent=true` 注入 X-Student-Token；社长/管理员操作 → 后端 verifyStudentAny + 角色判断 | 投票/设副社长 → 同体系 |
| 数据一致性 | 社区成员变更 → communities.json + students.json 双写 | 设副社长 → 仅写 communities.json deputyOwnerId，头衔展示读此字段即可；投票 → 仅写 tang-rank.json |
| 弹窗体系 | `<transition name="modal">` + `.modal-mask` + `.modal-content` + `@click.self` 关闭 | SuccessModal 完全复刻，加 Success 专用绿色渐变标题 |
| 姓名首字母算法 | 中文取每个字拼音首字母；英文/空格取首字母；数字保留；全部小写 | 实现全局 helper `toInitials(name)`，放在全局 scope |
| 防重复点击 | 现有大量 `.btn-sm` + `:disabled` | 留言发送按钮 + 投票按钮 + 申请按钮全部加 sending 态 ref |
| 移动端 @media 断点 | `@media (max-width: 768px)` → 三栏堆叠，容器最大宽 100%，margin 收紧 | 新 CommunityFullPage/TangRankPage 必须包含对应断点 |
