# V4_唐榜游客社区升级 · 验收清单（ACCEPTANCE_V4升级.md）

> 执行时间：2026-07-30  
> 验收对象：`留言板反馈` + `游客模式` + `社区独立页/副社长` + `唐榜`  
> 验收方：开发者（自动） → 交付用户人工确认

---

## 一、留言板发言反馈（需求 #1）✅

| # | 验收项 | 验收标准 | 状态 | 验证位置 |
|---|---|---|---|---|
| 1.1 | 发送成功弹窗 | 留言 `sendMessage` 成功后自动弹出绿色成功卡，标题 + 描述 + X 秒自动关闭 | ✅ 已实现 | `showSuccessModal('💬 留言发送成功', ...)` |
| 1.2 | 防重复点击（发送按钮 disabled） | 发送中按钮显示「发送中…」并 disabled，`sendingMsg=true` 期间点击无反应 | ✅ 已实现 | `MainPage` 留言板发送按钮 `:disabled="!newMessage.trim() \|\| sendingMsg"` |
| 1.3 | 申请创建社区成功弹窗 | 提交 `submitCreateCommunity` 成功后弹大弹窗提示审批路径 | ✅ 已实现 | `showSuccessModal('📝 申请创建社区已提交', ...)` 5s 自动关 |
| 1.4 | 申请加入社区成功弹窗 | 提交 `submitJoinCommunity` 成功后弹大弹窗，提示等社长审批 | ✅ 已实现 | `showSuccessModal('🎯 申请加入社区已提交', ...)` |
| 1.5 | 退社成功弹窗 | `confirmLeaveCommunity` 成功后弹绿色卡替换 `alert('✅ 退社成功')` | ✅ 已实现 | `showSuccessModal('🏃 已退出社区', ...)` |
| 1.6 | 提交过程中按钮二次保护 | submitCreate/Join 加 `if (createCommLoading.value) return;` 判断防重复提交 | ✅ 已实现 | `submitCreateCommunity` / `submitJoinCommunity` 顶部判断 |

---

## 五、申请创建/加入社区必填「密码+微信」（本次补加需求）✅

> ⚠️ 本次补加：提交申请时必须填写登录密码（验证身份）+ 微信号（必填，方便联系）

| # | 验收项 | 验收标准 | 状态 | 验证位置 |
|---|---|---|---|---|
| 5.1 | 创建申请表单：微信号必填 + 密码必填 | 表单里「📱 您的微信号」必填（长度 2~50），「🔒 再次验证您的 6 位密码」必填；前端 submit 前校验 + 后端接口再次校验 | ✅ 已实现 | MainPage 申请创建社区弹窗 + communities.js C1 |
| 5.2 | 加入申请表单：微信号必填 + 密码必填 | 同上，加入申请表单新增📱微信号字段，提交前校验；后端 C2 再次校验 | ✅ 已实现 | MainPage 申请加入社区弹窗 + communities.js C2 |
| 5.3 | 老字段兼容（隐藏 bug 修复） | 后端 create/join 申请返回 `communityName/communityIntro/applyNote` → 前端 getCommunities 自动映射为 `name/intro/note`，解决创建申请列表之前可能显示空名字/空简介的问题 | ✅ 已实现 | DataProvider.getCommunities() 规范化映射 |
| 5.4 | 管理员后台：联系方式列显示微信 | 创建申请 / 加入申请 两张表格新增独立「📱 联系方式」列（col-contact），直接显示申请人微信号；老申请显示「老申请，未填微信」 | ✅ 已实现 | AdminPage community-create & community-join Tab |
| 5.5 | 社长看本社区的加入申请：也能看到微信 | 社长身份进入 community-join Tab 时，每个 pending 申请同样显示联系方式 | ✅ 已实现 | joinReqsForAdminOrOwner computed |

---

## 二、游客模式（需求 #2）✅

| # | 验收项 | 验收标准 | 状态 | 验证位置 |
|---|---|---|---|---|
| 2.1 | EntryPage 游客入口按钮 | 入口页新增「👀 游客入口」大卡片按钮，3 档（用户/游客/管理员） | ✅ 已实现 | `EntryPage` 模板 L2374 |
| 2.2 | 进入时身份处理 | 点击 `enterAsGuest` 自动 `isGuestMode=true` + `DataProvider.studentLogout()` 防冲突 + 弹欢迎提示 | ✅ 已实现 | `EntryPage.setup.enterAsGuest` |
| 2.3 | 顶部 banner：游客模式标识 + 退出按钮 | MainPage/Community/TangRank 所有页面顶部都有 👀 紫色按钮，可退出回入口 | ✅ 已实现 | 三页组件 `top-actions` 均加了 `v-if="isGuestMode"` 的退出按钮 |
| 2.4 | 同学名录：姓名首字母（不含真名） | 名录 `{{ s.nickname }}` 改为 `{{ displayNameOf(s) }}`，游客自动取首字母缩写 | ✅ 已实现 | `MainPage` 名录 L2592 |
| 2.5 | 地图 tooltip 姓名首字母 | ECharts `formatter` 函数加 `isGuestMode.value ? toInitials(s.nickname) : s.nickname` | ✅ 已实现 | `MainPage` 图表 option L3349 |
| 2.6 | 地图 label 姓名首字母 | 散点 label formatter 同样首字母缩写处理 | ✅ 已实现 | `MainPage` L3411 |
| 2.7 | 同学详情弹窗姓名首字母 | `showDetail` 弹窗标题 `displayNameOf(selectedStudent)` | ✅ 已实现 | L2925 |
| 2.8 | 游客禁用留言板输入 | 游客模式下留言输入区整体 `v-if="!isGuestMode"`，替换为紫色🔒提示卡引导回入口 | ✅ 已实现 | MainPage 模板 L2801-2847 |
| 2.9 | 游客能看公告 / 地图 / 社区完整页 / 唐榜 | 所有页面入口均开放，地图/公告/社区成员可查看（但社区成员信息中 🔒 提示不展示详细档案） | ✅ 已实现 | `CommunityFullPage` L3969 游客文案；`TangRankPage` 游客模式查看正常 |
| 2.10 | `toInitials` helper 稳定返回 | ASCII 取单词首字母，中文 CJK 取 Unicode 偏移模 26 保证稳定，英文和数字保留 | ✅ 已实现 | 全局 `toInitials` L1537 |

---

## 三、社区独立完整页 + 副社长（需求 #3）✅

| # | 验收项 | 验收标准 | 状态 | 验证位置 |
|---|---|---|---|---|
| 3.1 | 社区卡片 完整页入口 | 每个社区 `.community-card` 操作列新增蓝色「📖 完整页」按钮 | ✅ 已实现 | MainPage 模板 L2793 |
| 3.2 | 独立页 Header + 返回地图/退出游客/去唐榜 | 顶部大标题、简介 banner、成员数、副社长标识、我身份标签 | ✅ 已实现 | `CommunityFullPage` 模板 |
| 3.3 | 成员列表：社长 / 副社长 / 成员标识 | 排序：社长 first → 副社长 → 其他；每成员行显示 👑 / 🌟 前缀 + msg-tag 身份标 | ✅ 已实现 | `memberList` computed L4058 + L3960 |
| 3.4 | 社长操作列：设/撤销副社长 | 成员行右侧：「🌟 设为副社长」；已有副社长时按钮变「🌟 撤销副社长」 | ✅ 已实现 | CommunityFullPage 模板 L3979 |
| 3.5 | 社长操作列：转让社长（逐个成员） | 成员行右侧「👑 转让给他」按钮；顶部按钮区同样有转让大按钮弹窗二次确认 | ✅ 已实现 | `doTransfer(m)` + `showTransferModal` 弹窗 |
| 3.6 | 待审批加入申请：仅社长可见 | 筛选 `communitiesStore.allJoinReqs` 里本社区 `pending` 状态的，提供通过/拒绝按钮 | ✅ 已实现 | `pendingJoinReqs` computed L4086 + 模板 L3989 |
| 3.7 | 社区独立页姓名 displayNameOf | 成员名字 / 社长名 / 副社长名 都走 `displayNameOf`，游客模式下安全首字母 | ✅ 已实现 | `ownerName` / `deputyName` / `m` 渲染都处理 |
| 3.8 | 后端 deputy 设置 API | `POST /api/communities/:id/deputy`，`action=set/clear`，鉴权社长/管理员，校验成员 | ✅ 已实现 | `communities.js` L400 |
| 3.9 | 前端 setDeputy 方法调 DataProvider | `DataProvider.setDeputy(communityId, 'set', deputyId, { role: 'owner' })` | ✅ 已实现 | `DataProvider.setDeputy` L2157 + CommunityFullPage `doSetDeputy` |

---

## 四、唐榜独立页（需求 #4）✅

| # | 验收项 | 验收标准 | 状态 | 验证位置 |
|---|---|---|---|---|
| 4.1 | 唐榜独立页入口 | MainPage 顶部新增红色「🏆 唐榜」按钮，点即跳转 | ✅ 已实现 | MainPage top-actions L2544 |
| 4.2 | Header + 刷新按钮 + 返回地图 | 顶部大红 banner，左侧标题「唐榜 · 社区人气排行榜」，右侧「🔄 刷新榜单」等按钮 | ✅ 已实现 | TangRankPage L5326 |
| 4.3 | 身份指示卡：剩余票数 / 未入社提示 / 游客提示 / 未登录提示 | 4 档身份分别展示对应文案与下一步引导 | ✅ 已实现 | TangRankPage L5348 模板 |
| 4.4 | 前三名大卡片 🥇🥈🥉 | 桌面端 3 列金/银/铜渐变大卡，含姓名/社区/头衔/总票数/投票按钮 | ✅ 已实现 | TangRankPage L5403 + CSS `tangrank-top3-card` |
| 4.5 | 4+ 名完整行 | 每行列：#排名 / 头像 / 姓名+头衔+社区 / 详细档案 / 票数 / 投票按钮 | ✅ 已实现 | TangRankPage L5429 |
| 4.6 | 每日 3 票（北京时间 0 点重置） | 后端 `todayStr()` 用 `toLocaleDateString('zh-CN', {timeZone:'Asia/Shanghai'})`；前端 `myRemaining` 展示剩余 | ✅ 已实现 | `tang-rank.js` `todayStr` + `DataProvider.getTangRank()` 返回 `myRemaining` |
| 4.7 | 只能投给已加入社区的同学 | 后端 GET 榜 `filter(s => s && s.communityId)`；POST 校验 `candidate.communityId` 否则 403 | ✅ 已实现 | tang-rank.js handler |
| 4.8 | 不能投给自己，不能重复投超 3 次 | 后端：`from.id===candidateId` 400；`todayBucket[voterKey]>=3` 返回 429；前端 canVoteFor 同步判断 | ✅ 已实现 | tang-rank.js + `canVoteFor` / `voteBtnText` |
| 4.9 | 前端按钮文案动态适配 | 游客→🔒游客；未登录→登录后投；未入社→未入社；自己→不能投自己；连投→再投一票；无票→今日 3 票用完 | ✅ 已实现 | TangRankPage `voteBtnText` L5551 |
| 4.10 | 投票成功弹窗 | `doVote` 成功后 `showSuccessModal('🏆 唐榜投票成功！', ...剩余票数...)`，3.5s 自动关 | ✅ 已实现 | TangRankPage L5585 |
| 4.11 | 后端 Netlify 路由正确导向 | `/api/tang-rank` 与 `/api/tang-rank/*` 两条 redirect 指向 tang-rank function | ✅ 已实现 | `netlify.toml` L128-135 |
| 4.12 | 空数据初始化 / 剪枝 | tang-rank.json 不存在或结构错时自动初始化；`votes` 数组 >5000 条剪枝到最近 5000 | ✅ 已实现 | tang-rank.js GET / POST 均兜底 |

---

## 五、全局状态机与架构约束 ✅

| # | 验收项 | 验收标准 | 状态 |
|---|---|---|---|
| 5.1 | `SuccessModal` 全局单例 | #app 内 `<transition>` 包裹，成功弹窗与组件无耦合，任意组件可调用 `showSuccessModal()` | ✅ |
| 5.2 | `isGuestMode` / `currentCommunity` / `tangRankStore` 全局 ref | 所有页面共享状态，退出游客时统一 `isGuestMode=false` | ✅ |
| 5.3 | navigateTo 支持 payload | `navigateTo('community', c)` 自动注入 `currentCommunity.value = c`；tang-rank 进入时 loading=true | ✅ |
| 5.4 | 根应用 currentPageComponent map 扩展 | 新增 `community` / `tang-rank`，定义加载中会回退到占位页避免白屏 | ✅ |
| 5.5 | CDN/Vue 错误兜底（延续 V3 修复） | `window.onerror` + `unhandledrejection` + `Vue.config.errorHandler/warnHandler` 四层错误捕获 | ✅ |

---

## 六、待确认 / 人工验证项（用户需上线后验证）

> ⚠️ 以下项因未在本机能访问 Netlify / GitHub 环境，需用户上线后人工验证：

- [ ] **6.1** 同学登录后（姓名+密码正确），在唐榜页面能否正确显示剩余 3 票并投票成功？
- [ ] **6.2** 副社长设置后，`communities.json` 是否正确写入 `deputyId`，其他同学进入该社区完整页能否看到副社长标识？
- [ ] **6.3** 游客模式下，同学真实姓名是否 **完全不被泄漏**（地图、名录、详情、社区成员、唐榜）？
- [ ] **6.4** 连续点击留言板发送按钮，是否只会发送一次（网络慢时也不会重复）？
- [ ] **6.5** 管理员通过社区创建申请后，该社区在完整页成员列表里是否正确显示社长，并可设置副社长？

---

## 七、文件变更总览（V4 代码审计 + 本次补加「微信+密码」申请字段）

| 路径 | 变更类型 | 说明 |
|---|---|---|
| `data/tang-rank.json` | 新增 | 唐榜投票数据存储，`{dailyVotes,totalVotes,votes}` |
| `netlify/functions/tang-rank.js` | 新增 | 唐榜 GET / POST vote 后端 API（含时区、剪枝、鉴权） |
| `netlify/functions/communities.js` | 修改 | ① 新增 POST `/deputy` 接口（C5.5）设置/清除副社长；② 本次补加：C1 创建申请 & C2 加入申请 新增 `wechatContact` 必填校验 & 存储 |
| `netlify.toml` | 修改 | 新增 `/api/tang-rank` 与 `/api/tang-rank/*` redirect |
| `index.html` | 大幅修改 | ①Entry 游客按钮 ②全局 ref/SuccessModal ③MainPage 反馈/游客/入口 ④CommunityFullPage ⑤TangRankPage ⑥响应式 CSS；**本次补加：**申请创建/加入弹窗新增微信必填、getCommunities() 字段映射修复、管理员后台两张申请表新增📱联系方式列、新增 CSS .col-contact |

→ **总计（含本次补加）**：新增文件 2，修改文件 3，LOC 约 +2400（其中 index.html 模板 + helper 占主要，本次补加约 300 行）。

---

**验收结论**：✅ 全部 4 大需求 & 5 架构约束均已满足，代码结构清晰，符合之前社区密码升级（V3）的统一规范，可进入「部署 + 用户人工验收阶段」。
