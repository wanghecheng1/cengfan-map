# CONSENSUS_社区密码升级 v1.0

> 版本：v1.0（2026-07-29 最终定稿，已解决所有高优先级不确定）
> 已确认决策：Q1(同学能看自己密码) Q2(6位纯数字) Q3(赤红=字体色+描边 天蓝=背景发光 银=提亮) Q4(sessionStorage) Q5(社长先转让才能退)

---

## 1. 需求描述（精确定义，无歧义）

本次升级包含 6 大功能模块：

### M1. 姓名框色号扩展（需求1+2）→ level 0-3 不变，新增 4+5 且调整 2
- 管理员新增/编辑同学档案时，色号下拉从 4 档扩展到 6 档
- **level 4（赤红字体）**：名字字体是 `#C0392B` 赤红色粗体 + `#E74C3C` 赤红描边 1.5px，背景是淡粉渐变（不浓，突出字体本身）
- **level 5（天蓝耀眼背景）**：背景 `#E3F2FD → #29B6F6 → #0277BD` 渐变 + 外发光阴影 `0 0 14px rgba(41,182,246,0.55)`，字体白色粗体 + 深蓝描边
- **level 2（银色）**：从原来 `#E0E0E0` 灰蒙蒙提亮成亮青白 `#FFFFFF → #F5F7FA → #CFD8DC`，字体深青灰 `#263238` + 亮银描边

### M2. 同学密码系统（需求3 前半）
- 后端**自动为每个同学生成不重复的 6 位纯数字密码**（6 digits；同学新增、申请通过、老学生批量补密码时都保证有密码）
- 管理员后台有专门的「密码管理 Tab」：显示姓名 / 大学 / 密码 表格；支持「重置单个同学密码」和「批量补全所有空密码」两个按钮
- 同学通过密码+姓名验证成功后，主页顶部显示身份卡片：**自己的密码明文可见**

### M3. 同学单聊管理员（需求3 后半）
- 同学验证实名成功 → 身份卡片下方出现「联系管理员」按钮 → 打开单聊弹窗（历史消息 + 输入框 + 发送）
- 管理员进入「单聊收件箱」Tab → 左侧会话列表（按同学头像/姓名分组，有未读红点）→ 右侧是当前会话消息 + 回复输入框
- 消息字段：`{id, studentId, sender: student|admin, content, created_at, read}`；管理员进入会话自动把所有 sender=student 的消息标记已读

### M4. 留言板实名验证（需求4+6）
- 公开留言板 POST `/api/messages` 新增两个参数 `studentName + studentPassword`（前端从 sessionStorage 的 studentSession 中拿）
- **后端强制校验**：密码正确 → `verifiedReal=true`，并把 `name` 写成 `student.nickname + (communityName? "｜社区名":"")`；密码错误/未传 → `verifiedReal=false`，`name` 强制改成「匿名校友」**覆盖前端传的任何内容**
- 留言板每条消息 UI：匿名的和之前一样灰色角标；实名的左边显示绿色小角标「已实名」；有社区的实名消息还会再显示蓝色社区徽章

### M5. 社区板块（需求5 全部 8 子点）
- **创建社区（需实名）**：同学在主页「社区卡片」点「申请创建社区」→ 弹窗填「社区名（≤20）+ 简介」→ 提交到创建申请池 → 管理员在「创建社区审批 Tab」通过/拒绝 → 通过后自动创建社区，创建人**自动成为社长 + 自动加入**
- **加入社区（需实名 + 当前无社）**：同学在社区列表选一个 → 点「申请加入」→ 加入申请进入该社社长的待审批池 → 社长在「社长面板」同意 → 该同学 communityId=该社ID；同时 memberIds 数组加进去
- **社长转让**：社长面板有「转让社长」下拉框（仅列出本社成员）→ 选目标同学 → 确认后 ownerId 改为新社长；原社长还是成员；前端提示转让成功
- **社长退出**：社长点退出社 → 校验：如果 memberIds 只有自己（没别人可转）→ 提示「请先解散社区（找管理员删除）或先加成员再转让」；否则提示「请先转让社长才能退出」→ 必须先转让完成后才能退出（退出后 communityId 清空，从 memberIds 中移除）
- **管理员删除社区**：「社区管理 Tab」点删除 → 确认弹窗：「会把该社 XX 位成员全部踢出，确定？」→ 软删社区（`status='deleted'`）+ 所有成员 `communityId=null` + 所有 pending 的创建/加入申请标记 rejected
- **一人只能选一个社区**：前端限制（已有社时，「申请创建」和「申请加入其他社」按钮全部灰掉禁用 + 红字提示「你已在 XX 社，先退出才能申请」）；后端 3 处强校验（创建社审批通过、加入社审批通过、直接接口调用）全部拒绝，返回错误提示
- **社区板块 UI**：主页右栏（和「公告/留言板/聊天板」并列的 info-card）新增「社区」Tab：上半显示「已创建的活跃社区列表（卡片区，显示社名+简介+社长名+成员数）」；下半显示两个按钮「+ 申请创建社区（已实名才能点）」+「根据我当前状态灰/亮的通用提示文字」

### M6. 留言板社区显示（需求6）
- 同 M4 的后端 name 拼装逻辑：实名 + 在社 → `name = "张三｜篮球社"`；实名 + 无社 → `name = "张三"`；匿名 → `"匿名校友"`
- 留言板列表按后端返回的 name 原样显示，前端不再自己拼社区名；后端 message JSON 同时冗余写入 `{communityId, communityName}` 便于未来过滤/扩展

---

## 2. 技术约束与集成方案

| 维度 | 约束内容 | 原因 / 影响 |
|---|---|---|
| **存储** | 继续使用 **GitHub JSON 仓库存储**，不引入任何数据库（MySQL/Redis/Netlify Blobs 都不用）| 保持现有架构稳定；已有 5 个 functions 都用相同模式，复用成熟代码 |
| **新增 JSON 文件（4 个）** | `data/communities.json` + `data/community-create-requests.json` + `data/community-join-requests.json` + `data/direct-messages.json`，初始值 `[]` | 纯数据文件，上传到 GitHub 仓库即可，不要 `.gitignore` |
| **密码存储** | **明文 6 位数字**，保存在 `students[].password` 字段，不 hash | M2 要求管理员 + 同学自己都能看到密码明文，hash 方案不符合需求 |
| **后端鉴权双层**：① 管理员写操作：继续现有 `X-Admin-Token`（header，值= `ADMIN_PASSWORD` 返回的 token）② 同学写操作（发留言/申请社区/发单聊）：用 `{studentName, studentPassword}` 两个字段**在每个 API body 里传**，后端每条校验，不用 token | 避免引入两套 token 系统；同学只在需要写操作时发密码，操作结束后端不持久化 token；和 `sessionStorage` 方案对齐（内存存 studentId，操作时再用 studentId 取 current student 核对密码，防伪造）|
| **后端不用 `??` 操作符**（Netlify Functions Node 版本不确定的安全约束）| 所有可选字段合并使用「`!== undefined && !== null` 三元 + `\|\|` 兜底」，不用空值合并运算符 | 上次 announcements.js 就是这个坑，全项目统一避免 |
| **不引入 WebSocket / 实时推送** | 所有社区、单聊、留言全是「进入页面拉一次 + 5 秒轮询」刷新 | 小圈子 5s 体验够用；避免 Netlify Functions 升级 Netlify Edge，成本和复杂度都高 |
| **单聊消息列表上限** | 每个会话（每个同学对管理员）倒序保留最新 **500 条**；超过 500 条时写文件前删除最旧的 | 防止单个 JSON 文件无限变大（GitHub 文件上限 < 100MB）|
| **社区 ID / 申请 ID / 消息 ID 生成** | 全部 `Date.now()`（和现有 students.id / messages.id 风格保持一致）| 简单不重复 |
| **同学身份 session 校验**：前端刷新后，前端把 sessionStorage 拿到的 `studentId` 发给 `POST /api/student-verify-session` 后端核对密码没变 | 管理员重置同学密码后，同学旧 session 立即失效，不会拿重置前密码继续发消息 | 安全硬约束 |
| **移动端适配**：新增 UI（身份卡片 / 社区卡片 / 社长面板 / 密码管理 Tab）全部要**自带 `@media (max-width:768px)` 的移动适配** | 保证升级后手机顶端公告仍然完整显示 + 所有新组件在手机上不横向出滚动条 | 和上次移动端修改保持一致 |
| **向后兼容**：老学生 `password=null/空` / `titleLevel=0-3` / `communityId=null` 全部表现不变，不会导致报错 | 不会出现「密码为空实名接口返回 500」 / 「titleLevel 1-3 渲染成背景透明」等线上问题 | 升级后老用户无感 |
| **敏感环境变量**：`ADMIN_PASSWORD / GITHUB_TOKEN / GITHUB_REPO / GITHUB_BRANCH` 只从 Netlify Dashboard 的 **Environment Variables** 读取 | 绝对不能 hardcode 到代码文件里提交 | 安全规范（本项目现有规范，不做改变）|

---

## 3. 新增 API 接口契约（共 14 条，精确到入参出参）

### 3.1 同学端身份（2 条）
| # | Method | Path | 鉴权 | 入参 body | 出参（成功 200）|
|---|---|---|---|---|---|
| S1 | POST | `/api/student-login` | 无 | `{nickname:"张三", password:"123456"}` | `{ok:true, student:{id, nickname, title, titleLevel, communityId, communityName, password}}` |
| S2 | POST | `/api/student-verify-session` | 无 | `{studentId:123}` | `{ok:true, isValid:true/false, student:{...} / null}`（如果密码被重置返回 isValid=false，前端清 session）|

### 3.2 学生档案扩展（3 条，都在 students.js 里加）
| # | Method | Path | 鉴权 | 入参 / 作用 | 出参 |
|---|---|---|---|---|---|
| ST1 | POST | `/api/students/:id/reset-password` | 管理员 | 空 body；作用：给该学生重新随机生成 6 位密码，写回 students.json | `{ok:true, newPassword:"654321"}` |
| ST2 | POST | `/api/students/batch-fill-passwords` | 管理员 | 空 body；作用：遍历所有学生，`password` 空的全部生成 6 位，批量写回 | `{ok:true, filledCount:12, total:50}` |
| ST3 | POST | `/api/students/:id/leave-community` | 同学（body 带 `{studentName, studentPassword}`）| 作用：退出自己的社区；如果自己是社长则报错（D11 先转让才能退）| `{ok:true, message:"已退出XX社"}` |

### 3.3 社区（5 条，都在 communities.js 里）
| # | Method | Path | 鉴权 | 入参 body | 出参 |
|---|---|---|---|---|---|
| C1 | GET | `/api/communities` | 无 | query: `?status=active`（默认只返活跃） | `[{id,name,description,ownerId,ownerNickname,memberCount,memberIds,created_at}]` |
| C2 | POST | `/api/community-create-requests` | 同学（`name+password`）| `{creatorStudentName, creatorStudentPassword, communityName:"篮球社", description:"..."}` | `{ok:true, requestId:xxx}`（成功写入待审批）|
| C3 | POST | `/api/community-create-requests/:id/handle` | 管理员 | `{approve:true/false, rejectReason:""}` | approve=true → 创建社区并把创建人自动加社；approve=false → 标记 rejected |
| C4 | POST | `/api/community-join-requests` | 同学（`name+password`）| `{studentName, studentPassword, communityId:xxx}` | `{ok:true, requestId:xxx}`（进入该社社长待审批）|
| C5 | POST | `/api/community-join-requests/:id/handle` | 社长 或 管理员（社长在 body 传自己的 `studentName+studentPassword` 也能过鉴权）| `{approve:true/false, studentName, studentPassword, rejectReason:""}` | approve=true → 加 memberIds + 写 student.communityId（中间硬校验一人一社）|
| C6 | POST | `/api/communities/:id/transfer-owner` | 社长（传社长密码）| `{studentName, studentPassword, newOwnerStudentId:xxx}` | `{ok:true, newOwnerId:xxx}` |
| C7 | DELETE | `/api/communities/:id` | 管理员 | 空 | `{ok:true, membersClearedCount:12}`（软删 + 清空所有成员 communityId + 所有 pending 申请变 rejected）|

### 3.4 单聊（2 条，direct-messages.js）
| # | Method | Path | 鉴权 | 入参 | 出参 |
|---|---|---|---|---|---|
| DM1 | GET | `/api/direct-messages` | 管理员；或 同学自己（`?studentId=xxx&studentPassword=xxx` 作为 query）| 同学查看只能看自己 studentId 对应会话；管理员看所有会聚合后按 studentId 分组的列表 | 管理员：`[{studentId, studentNickname, lastMessage, lastTime, unreadCount, messages:[]倒序200}]`；同学：`messages:[]` |
| DM2 | POST | `/api/direct-messages` | 管理员（X-Admin-Token + body 带 `targetStudentId`）或 同学（body 带 `studentName + studentPassword`）| `{content:"...", targetStudentId（管理员发必填）, studentName+studentPassword（同学发必填）}` | `{ok:true, message:{id,sender,content,created_at}}` |
| DM3 | POST | `/api/direct-messages/mark-read` | 管理员 | `{studentId:xxx}` → 把该会话所有 sender=student 的消息 read=true | `{ok:true, markedCount:8}` |

### 3.5 留言板扩展（1 条，修改 messages.js POST）
| # | Method | Path | 鉴权 | 入参 | 出参（返回最终插入的 message，name=后端拼好的）|
|---|---|---|---|---|---|
| M4-1 | POST | `/api/messages` | 无（后端自动校验身份）| `{content:"...", studentName?, studentPassword?}`（同学已实名时传两个参数，否则不传）| **最终返回**：`{id, name, content, verifiedReal, communityId, communityName, created_at}`；**关键约束**：后端写回 name 覆盖前端传的 name 字段，匿名时强制 `name="匿名校友"` + `verifiedReal=false` |

> 注：GET `/api/messages` 保持不变，前端按返回的 `verifiedReal / communityName` 渲染 UI 徽标即可。

---

## 4. 验收标准（精确到可验证，16 条）

### 色号 M1（3 条）
- [ ] 1. 管理员新增/编辑档案，色号下拉框现在有 6 项（正常 / 金 / 亮银 / 铜 / 赤红字体 / 天蓝耀眼）；每项右边带预览小方块
- [ ] 2. 选「赤红字体」→ 保存后，左侧名录中该同学姓名框字体是 `#C0392B` 赤红色粗体，带赤红描边，背景是淡粉渐变（不会整个背景都是红）
- [ ] 3. 选「天蓝耀眼」→ 姓名框背景亮蓝渐变并发光阴影（外发光 `0 0 14px`），字体白色粗体 + 深蓝描边；银色姓名框明显比修改前更亮（偏青白色，不再灰蒙蒙）

### 密码 + 实名 M2 + M4（6 条）
- [ ] 4. 管理员「密码管理 Tab」：列所有同学，每行显示「姓名 / 大学 / 密码 / 重置密码按钮」；密码全是 6 位纯数字，没有字母
- [ ] 5. 点「批量补全空密码」：老学生 password 为空的，全部生成 6 位数字；弹提示「成功补全 13 位同学密码」
- [ ] 6. 留言板顶部放「身份验证框」（姓名输入 + 密码输入 + 按钮）；输对后 banner 下方显示绿色身份卡片：`✅ 已实名：张三 | 您的密码：123456 | 退出登录`；刷新页面 → 身份卡片仍然显示（符合 sessionStorage Q4）；关了浏览器标签页再开 → 身份卡片消失，需要重新验证
- [ ] 7. 验证成功后留言板发一条消息 → 留言显示 name=「张三」+ 绿色小角标「已实名」，verifiedReal=true；管理员重置张三密码后，张三刷新页面 → 身份验证失效（因为密码变了，session 校验不过），退回到匿名状态
- [ ] 8. 故意输错密码点验证 → 红提示「姓名或密码不正确，请找管理员索要密码」；直接发留言（不验证）→ 留言显示 name=「匿名校友」，verifiedReal=false，前端在匿名消息上加灰色「匿名」角标
- [ ] 9. 刷新浏览器，其他电脑访问同样的页面 → 留言板消息内容 / 已实名 / 社区标签 三个字段完全一致（云端同步，不是本地）

### 社区 M5（5 条）
- [ ] 10. 「社区 Tab」：显示所有已创建社区（卡片），每张卡片显示社名+简介+社长姓名+成员数；下方有「申请创建社区」「申请加入社区」按钮；如果我已经在社里，按钮全部灰掉显示「您已加入『篮球社』，如需换社请先退出当前社」
- [ ] 11. 创建社区流程：实名（张三无社）→ 提交创建申请 → 管理员后台 Tab5 看到待审批列表 → 通过 → 张三自动成为「篮球社社长 + 成员」，张三不能再申请其他社（按钮灰）；管理员拒绝 → 创建申请变 rejected，张三仍可以再次申请
- [ ] 12. 加入社区流程：实名（李四无社）→ 在篮球社卡片点「申请加入」→ 社长面板（张三进入）显示 1 条待审批加入申请 → 点同意 → 李四进入篮球社（李四 identity card 显示「所属社区：篮球社」）；拒绝 → 李四收到状态并可以再申请其他社
- [ ] 13. 社长转让：张三（社长）面板点「转让社长」→ 选李四（本社成员）→ 确认后：李四是新社长，张三还是成员；张三退出社前如果没转让给别人 → 提示「请先转让社长才能退出」；转让后张三再点退出 → 成功（communityId 清空 + memberIds 移除）
- [ ] 14. 管理员删除「篮球社」→ 确认提示弹 XX 名成员会被踢出 → 确定 → 篮球社不再显示在社区 Tab；所有成员（李四+张三）的 identity card 里「所属社区」消失；并且「申请加入其他社」按钮重新亮起

### 单聊 M3 + 留言板社区 M6（2 条）
- [ ] 15. 同学张三实名验证后，身份卡片下方有「💬 联系管理员」按钮 → 点开显示与管理员的聊天历史 → 发送 → 刷新管理员后台「单聊收件箱 Tab」→ 左侧会话列表显示张三（有红点未读）→ 点进去看到消息并回复 → 同学张三刷新自己的单聊弹窗看到管理员回复
- [ ] 16. 同学李四加入篮球社后，在留言板发一条消息 → 留言列表中他的 name 显示为 **「李四｜篮球社」**（后端拼好返回，前端原样显示）；同学张三（实名但没在社）发的显示 **「张三」**（不带社区）；未验证的显示 **「匿名校友」**

### 兼容性（附加，不计分但默认通过）
- [ ] 老同学档案没设置新色号（titleLevel 0-3）→ 渲染和升级前一模一样，没有错位/透明
- [ ] 顶端公告横幅在手机（iPhone 12 尺寸）仍然能完整换行显示（和上一轮移动端适配结果一致，新增 UI 没破坏已有的 @media 样式）

---

## 5. 边界限制（红线，不允许突破）

1. ❌ 不做同学 P2P 单聊，只允许「同学 → 管理员」的 1:1
2. ❌ 不做社区内部群聊、社区公告、社区头像封面（预留字段但 UI 不做，未来可扩展）
3. ❌ 不做密码 hash（需求明确要能看明文）；前提：GitHub 仓库必须 Private（管理员端配置，我这边提示）
4. ❌ 一人一社：不允许任何通过接口直接修改绕过（硬校验 3 处）
5. ❌ 社长不允许直接退出未转让的社：必须先转，否则接口报错
6. ❌ 留言板名字：后端写死返回，前端**绝不**根据本地 session 自己拼 name

---

## 6. 文档同步（和代码改动并行）

- 本次代码完成后，更新 `FINAL_*.md` 包含 API 契约 + 密码生成规则 + 色号对照表（便于之后维护）
- `TODO_*.md` 列出「3 个你需要手动配置的事项」（实际可能：① 手动提交 4 个空 JSON data 文件到 GitHub 仓库 data/ 下、② Netlify Dashboard 的 Environment Variables 中确认 GITHUB_TOKEN 仍然有效、③ Netlify Build 重新 Trigger 一次）

---

## 7. 最终共识确认（本文件经阅读后无异议 → 进入 DESIGN 阶段）

本 CONSENSUS 文件 v1.0 已覆盖：
- ✅ 需求 6 大模块的精确描述（无歧义）
- ✅ 高优先级 Q1-Q5 全部已写入 D1-D14 最终决策
- ✅ 14 条新增 API 接口契约（精确到 Path + 鉴权 + 入参出参）
- ✅ 16 条可验证的验收标准
- ✅ 6 条不可突破的边界限制

如果没有异议，下一步我进入 **阶段 2 Architect（架构设计）**，生成 `DESIGN_社区密码升级.md`，包含 5 张 mermaid 架构图（系统分层 / 模块依赖 / 数据流 / 社区状态机 / 单聊数据流）+ 异常处理策略。
