# V4 需求最终共识文档（CONSENSUS）

> 任务名：V4_唐榜游客社区升级
> 版本：v1.0（基于 ALIGNMENT 自动决策，Q1/Q2 采用推荐方案 A，如需调整回滚）
> 生效日期：2026-07-30

---

## 一、最终需求描述（无歧义版）

### 1.1 留言板优化发言反馈
- **发送按钮防重复点击**：`sendMessage` 执行期间，按钮 `disabled=true`，按钮文案改为 `发送中…`，加 loading 转圈动画（用现有 CSS spinner 类 `.spinner`）。
- **发送成功弹窗**：发送成功后弹 SuccessModal，标题「✅ 留言发布成功」，内容 `你的留言已成功发布到全站留言板，大家都能看到啦～`，底部「好的」按钮 + 右上角倒计时 3 秒自动关闭。
- **创建社区申请成功弹窗**：`submitCreateCommunity` 成功后弹 SuccessModal：标题「🏛️ 创建申请已提交」，内容 `管理员将在 24 小时内审核，通过后你将自动成为该社区的第一任社长，请留意顶栏身份条变化～`，底部「我知道了」按钮。
- **加入社区申请成功弹窗**：`submitJoinCommunity` 成功后弹 SuccessModal：标题「🎯 加入申请已提交」，内容 `社长已收到你的申请，请耐心等待社长审批，通过后你的身份条会自动显示社区名徽标～`，底部「我知道了」按钮。

### 1.2 游客入口
- **EntryPage 新增第三个大按钮**：位于用户入口（左）、管理员入口（右）下方居中，视觉浅灰渐变，标题「👁️ 游客入口」，副标题「看看大家都在哪（不登录快速浏览）」，点击后 `isGuestMode=true; emit('navigate','home')`。
- **游客模式姓名首字母替换（全局）**：所有「同学姓名」展示位置 → 拼音首字母小写拼接，例：王和成 → whc，张三 → zs，Alice Smith → as，李雷4班 → ll4。涉及 7 处展示：
  1. 左侧同学名录 `.student-name`（L2444-L2467）
  2. 详情弹窗（showDetail 卡片）内姓名主标题 + 标签首字
  3. 地图 ECharts tooltip formatter 的姓名
  4. 留言板气泡发送者：实名/匿名的显示名首字母
  5. 社区广场成员列表 / 社区详情页成员列表 / 唐榜排行榜姓名
  6. 顶栏身份条（游客不登录，顶栏显示「👥 游客模式」）
  7. 社区广场卡片上的「创建者：XXX」→ 首字母
- **游客禁操作清单（disabled + 提示）**：
  1. 留言板输入框 → 灰掉，placeholder 改为「🔒 游客模式，登录后即可留言」，发送按钮 disabled
  2. 社区广场「🏗️ 申请创建新社区」「🎯 申请加入社区」→ disabled，悬停 title 提示「登录同学身份后可申请创建/加入社区」
  3. 「申请档案」「🎓 同学登录」按钮仍保留（后者保留登录升级能力）
  4. 唐榜页「投票」按钮 → disabled，提示「登录后每日 3 票」
- **游客可浏览（不受限）**：完整地图、完整公告、完整统计数据、完整同学名录（但首字母）、完整社区广场信息（但首字母）、完整唐榜排行榜。
- **顶栏身份条（游客态）**：显示 `👥 游客模式 · 已屏蔽姓名保护同学隐私` + 右侧按钮「🔄 返回入口页」+ 原「🎓 同学登录」保留（登录后 isGuestMode 自动置 false，身份升级为实名）。

### 1.3 社区单独完整页面
- **新增组件 CommunityFullPage**（400~800 行模板+setup），注册到 currentPageComponent map 为 key `'community'`。
- **进入方式（按 Q1 推荐方案 A）**：
  1. MainPage 社区广场每张社区卡片右下角 → 新增「查看详情 →」按钮，点击 `emit('navigate-community', c)` → 根应用捕获后 `currentCommunity.value = c; navigateTo('community')`
  2. EntryPage 新增一排 2 个小按钮：「🏘️ 社区大厅」（点击 navigateTo 'home' 且锚点滚动到社区广场）/「🏆 唐榜排行」（navigateTo 'tang-rank'）
- **CommunityFullPage 页面结构**：
  1. **社区头区（Hero）**：大号「🏛️ 社区名」+ 简介 + 创建时间 + 创建者姓名（+「👑 社长」徽章）+ 返回首页按钮
  2. **核心管理层**：显示社长（👑）+ 副社长（🥈）的头像首字母 + 姓名，社长端这里还有「设置/取消副社长」按钮（点击开选人弹窗）
  3. **成员列表区**：卡片网格（或表格）展示所有成员，每行包含：序号、头像首字母、姓名、头衔徽章、入社时间、角色（👑/🥈/普通）；社长端每行有「移出社员」按钮
  4. **操作区（按角色显示）**：
     - 社长：「🥈 设置副社长」「🚪 转让社长」「🗑️ 解散本社（仅管理员可删，此处提示找管理员）」
     - 副社长：「✅ 审批加入申请」（复用 joinReqsForAdminOrOwner）
     - 普通成员：「🚪 退出本社」（走现有 confirmLeaveCommunity）
     - 管理员端：额外显示「🗑️ 删除该社区」
- **副社长权限（对齐推荐方案）**：仅 1 位；可审批加入申请；不可转让社长；不可删社；不可设置副社长；在社区详情页、顶栏身份条、留言板社区徽章处，统一显示「🥈 副社长」标签。
- **后端副社长 API**：`POST /api/communities/:id/deputy`，body `{ deputyOwnerId: number | null }`（null = 取消副社长），鉴权：仅社长。

### 1.4 唐榜页面
- **新增组件 TangRankPage**，注册到 currentPageComponent map 为 key `'tang-rank'`。
- **进入方式（按 Q1 推荐方案 A）**：EntryPage 新增「🏆 唐榜排行」按钮 + MainPage 顶栏新增🏆图标按钮。
- **页面结构**：
  1. **顶栏**：大标题「🏆 唐榜 · 每日人气排行」+ 副标题「同学每人每日 3 票，一起选出最受欢迎的社区之星！」+ 剩余票数大徽章（已登录/在社区中：`<b>3</b> / 3 今日剩余`；未登录/不在社区：灰色 `🔒 登录后投票`）+ 返回首页按钮
  2. **规则卡片**（可折叠或常驻）：4 条规则①仅登录且在社区的同学可投 ②每日 3 票，0 点自动重置 ③不可投自己 ④可跨社区投 ⑤排行榜按总票数实时排序
  3. **排行榜表格/卡片网格**（按总票数降序，>=1 票才显示，0 票不展示避免过长）：
     - 行内容：排名奖牌（🥇/🥈/🥉/4+）+ 头像首字母（游客首字母，登录同学真名）+ 姓名 + 所属社区名徽章 + 当前总票数 + 投票按钮（剩票>0 且不是自己才亮）
  4. **底栏**：实时更新时间戳 + 说明
- **唐榜票仓与数据（按 Q2 推荐方案 A：全站总榜）**：
  - `data/tang-rank.json` 结构：
    ```json
    {
      "dailyVotes": { "2026-07-30": { "101": 2, "108": 3 } }, // YYYY-MM-DD → {studentId: 今日用票数}
      "totalVotes": { "101": 15, "108": 42 }, // {studentId: 历史累计票}
      "votes": [ // 投票流水（用于排查重复刷票）
        { "id": 1, "voterId": 101, "candidateId": 108, "date": "2026-07-30", "createdAt": 178536xxxx }
      ]
    }
    ```
- **后端唐榜 API**：
  - `GET /api/tang-rank`：返回 `{ rank: [{studentId, nickname, communityId, communityName, total}, myRemaining: 3|0, myVotedToday: [candidateId, ...]] }`（鉴权：同学 Token 注入 myRemaining，游客态返回 rank 但 myRemaining=0）
  - `POST /api/tang-rank/vote`：body `{ candidateId: number }`，鉴权 X-Student-Token；校验：在社区中、当日剩票>0、不自投、候选人在社区中；成功扣 1 票、写流水、累加 totalVotes
- **重置规则**：北京时间当日 0 点自动重置（后端以 `date = toLocaleDateString('zh-CN', {timeZone:'Asia/Shanghai'})` 生成 key，跨日后 dailyVotes[date] 自然不存在就是剩 3 票）

---

## 二、验收标准（全部必须 ✅）

### 2.1 留言板成功弹窗（T1）
- [ ] 留言板点击发送 → 按钮立即 disabled，显示「发送中…」+ 转圈
- [ ] 发送成功 → 弹绿色 SuccessModal，含✅图标，3 秒内自动关闭；内容符合§1.1
- [ ] 发送失败 → 仍走现有 alert 红错，不弹 SuccessModal
- [ ] 创建/加入社区申请成功 → 各弹对应 SuccessModal（内容符合§1.1），不出现空白/文案错乱

### 2.2 游客模式（T2）
- [ ] EntryPage 出现第三个「👁️ 游客入口」大按钮（浅灰，视觉区别于用户蓝+管理员橙）
- [ ] 点游客入口 → 进入 MainPage，顶栏身份条显示「👥 游客模式 · 已屏蔽姓名保护同学隐私」+ 返回入口按钮
- [ ] 左侧同学名录所有姓名：王和成 → whc（姓+名拼音首字母全小写），验证至少 3 个不同姓名（2字/3字/中英混）
- [ ] 地图上点击任意点：tooltip 姓名显示首字母，详情卡姓名首字母，头衔仍可见
- [ ] 留言板输入框：disabled + 灰，placeholder 含「游客模式 登录后可留言」字样，发送按钮 disabled
- [ ] 社区广场「申请创建/加入」按钮：disabled + hover 有登录提示 tooltip
- [ ] 唐榜排行榜：游客可看但投票按钮全 disabled，含「登录后投票」提示
- [ ] 游客模式下点「🎓 同学登录」→ 登录成功 → 顶栏切换为实名身份条，所有姓名恢复真名，留言板解锁，投票按钮解锁（剩 3 票）

### 2.3 社区独立页 + 副社长（T3）
- [ ] MainPage 社区广场每卡片右下角有「查看详情 →」按钮，点击跳转 `/community` 完整页面（URL 不 hash，但 currentPage='community'）
- [ ] CommunityFullPage 头区 + 管理层 + 成员列表 + 操作区共 4 区完整显示，移动端 ≤768px 堆叠无横滚
- [ ] 社长端：成员列表每行 + 管理层有「🥈 设为副社长」按钮，弹窗选人 → 确定后候选人头衔自动变「🥈 副社长」，顶栏身份条刷新
- [ ] 社长取消副社长：再点一次「🥈 取消副社长」→ 头衔恢复普通成员
- [ ] 副社长身份：登录后顶栏显示「🥈 副社长：社区名」，社区详情页可见「审批加入申请」tab，无转让/删社/设副社长权限
- [ ] 双写一致性：设置副社长后，刷新页面或其他用户访问，头衔仍显示正确（已持久化到 communities.json deputyOwnerId）

### 2.4 唐榜（T4）
- [ ] EntryPage / MainPage 有「🏆 唐榜排行」入口，点击跳转 TangRankPage
- [ ] 唐榜页显示规则卡 + 排行榜 + 剩票徽章（0或3），结构符合§1.4
- [ ] 同学 A 登录且在社区 → 剩票 3；投 1 票给同学 B → 剩票变 2，B 总票数 +1，排行榜 B 行排名实时上升（如果超过前一位）
- [ ] 自投：自己行的投票按钮 disabled，显示「😉 不能投自己哦」
- [ ] 当日满 3 票 → 所有投票按钮 disabled，显示「今日 3 票已用完，明天 0 点再来～」
- [ ] 跨 0 点后（或手动改 tang-rank.json dailyVotes key 测试）→ 剩票重置回 3
- [ ] 排行榜按总票数降序，前 3 名 🥇🥈🥉，4+ 名显示数字排名

---

## 三、技术实现方案

### 3.1 新增文件清单
| 文件 | 作用 |
|---|---|
| `data/tang-rank.json` | 唐榜票仓（dailyVotes / totalVotes / votes 流水） |
| `netlify/functions/tang-rank.js` | 唐榜 GET / POST vote API（2 合 1：GET 拉榜，POST 路径 `/api/tang-rank/vote` 投票） |
| `docs/V4_唐榜游客社区升级/*.md` | 6A 文档（ALIGNMENT/CONSENSUS/DESIGN/TASK/ACCEPTANCE/FINAL/TODO） |

### 3.2 修改文件清单
| 文件 | 改动点 |
|---|---|
| `index.html` | 新增全局 isGuestMode/ref + SuccessModal 复用组件 + CommunityFullPage + TangRankPage + 姓名首字母 helper + EntryPage 第三个按钮 + 社区详情跳转 + MainPage 游客渲染分支 + currentPageComponent 扩展 map |
| `netlify/functions/communities.js` | 新增子路径 POST `/api/communities/:id/deputy`（设置/取消副社长，写 communities.json deputyOwnerId） |
| `netlify.toml` | 新增 [[redirects]]：`/api/tang-rank/* /.netlify/functions/tang-rank 200` + 确保 `/api/communities/:id/deputy` 由 communities 函数处理（已有 `/api/communities/*` 通配则覆盖，不需要加） |

### 3.3 鉴权与约束
- **POST /api/communities/:id/deputy**：verifyStudentAny → 身份必须等于社区 ownerId，403 拒绝非社长；body 仅接受 deputyOwnerId ∈ 该社区 memberIds
- **POST /api/tang-rank/vote**：parseStudentToken → student 必须有 communityId 且 communityId 存在 → 401/403 拒绝游客/未入社/候选人非社员
- **防刷票**：Tang-rank.json votes 流水不剪枝但每日查 dailyVotes[date][voterId] >= 3 直接拒绝 429「今日票已用完」
- **防 CSRF**：所有 POST/PUT 保留 X-Admin-Token / X-Student-Token 头

---

## 四、不确定性全部解决 ✅
| 原不确定性 | 决策 | 依据 |
|---|---|---|
| Q1 入口位置 | 推荐 A：EntryPage 加小按钮 + MainPage 顶栏加图标 + 社区卡片「查看详情」跳转 | 与「完整页独立」的原需求意图最匹配 |
| Q2 唐榜范围 | 推荐 A：全站总榜，跨社区所有已入社同学 | 投票乐趣最高，避免小社区刷票冷清 |
| 副社长数量 | 1 位，数据结构 deputyOwnerId 单值 | 与「设置副社长」单数表述一致，未来可扩 |
| 姓名首字母语言 | 中文字典拼音首字母，无字典回退：取汉字 Unicode 模 26 映射字母 | 避免第三方 pinyin 库，单文件保持无外部依赖 |
| 弹窗样式 | 复刻现有 modal-mask / modal-content 体系 | 复用降低风格差 |
| 唐榜 0 票选手显示 | 不显示，仅展示总票 >=1 的候选人 | 防止人数过多列表过长 |

---

## 五、任务边界限制
- ❌ 不涉及 AdminPage 管理后台 UI 重构（如需副社长后台管理可后续任务追加）
- ❌ 不涉及唐榜月度榜/赛季榜/贡献榜/礼物系统
- ❌ 不涉及游客会话持久化（关标签页自动离开，下次进入口再点游客）
- ❌ 不涉及副社长转让社长功能（仅社长可转让，转让后新社长可重新任命副社长）
- ✅ 所有变更保持 V3 既有 API/数据兼容，老用户无损升级

---

**本共识文档签字（自动化）：6A-Workflow v1.0 ✅**
