# TASK_社区密码升级 v1.0

> 版本：v1.0（2026-07-29）
> 输入：DESIGN_社区密码升级 v1.0
> 输出：27 个**原子化、可独立编译测试、复杂度可控**的子任务 + 依赖图
> 任务执行顺序：严格按依赖 DAG，无依赖可以并行

---

## 1. 任务依赖图（DAG）

```mermaid
graph TD
    A1[初始化4个空JSON data文件] --> B1[netlify.toml 新增 13 条 redirects]
    A1 --> C1[后端 students.js 扩展密码功能]
    A1 --> C2[后端 student-login.js 新增]
    A1 --> C3[后端 messages.js 扩展留言板实名]
    A1 --> C4[后端 communities.js 新增7条路由]
    A1 --> C5[后端 direct-messages.js 新增]
    B1 & C1 & C2 & C3 & C4 & C5 --> D1[前端色号CSS 6档替换:亮银+赤红+天蓝]
    D1 --> D2[前端 studentSession + 身份验证卡片]
    D2 --> D3[前端管理员 Tab4 密码管理 + 重置/批量补密码]
    D3 --> D4[前端留言板实名渲染:已实名/社区徽章]
    D2 --> E1[前端 CommunityCard 社区信息卡 UI]
    E1 --> E2[前端 申请创建/申请加入 弹窗]
    E2 --> E3[前端 管理员 Tab5 创建社审批]
    E2 --> E4[前端 社长面板(审批加入/转让社长/退出社)]
    E3 --> E5[前端 管理员 Tab6 社区管理列表+删除]
    E4 --> E5
    D2 --> F1[前端 同学单聊管理员弹窗 UI]
    D2 --> F2[前端 管理员 Tab8 单聊收件箱]
    F1 --> F3[前端 单聊消息发送]
    F2 --> F3
    D4 --> G1[移动端@media 适配所有新UI]
    E5 --> G1
    F3 --> G1
    G1 --> H1[全链路16条验收标准回归测试]

    style A1 fill:#fde68a
    style C1 fill:#bae6fd
    style C2 fill:#bae6fd
    style C3 fill:#bae6fd
    style C4 fill:#bae6fd
    style C5 fill:#bae6fd
    style H1 fill:#bbf7d0,stroke:#16a34a,stroke-width:4px
```

**依赖说明**：
- A1（JSON）是所有后端 functions 的前置：因为后端启动就 getFileContent，如果 JSON 不存在直接报错 500
- 后端 C1-C5 全部完成 + redirects B1，才能开始前端 D1-F3（不然前端调接口全 404）
- 前端按依赖链：先色号 → 身份系统 → 密码管理 → 留言板 → 社区 → 单聊
- 最后 G1（移动端）+ H1（验收）作为质量门控

---

## 2. 原子任务清单（27 条，每条含 输入契约 / 输出契约 / 实现约束 / 验收）

### A 组：初始化 + 路由配置（2 条）

---

#### 【任务 A1】初始化 4 个空 JSON 数据文件
- **任务 ID**：A1
- **输入契约**：项目存在 `d:\TRAE\cengfan-deploy\data\` 目录
- **输出契约**：data 目录新增 4 个文件，内容都是 `[]`：
  - `data/communities.json`
  - `data/community-create-requests.json`
  - `data/community-join-requests.json`
  - `data/direct-messages.json`
- **实现约束**：UTF-8 编码，无 BOM，不要缩进问题（直接写 `[]` 即可）
- **依赖关系**：无（最前置）
- **验收标准（自测）**：用 VS Code 打开 4 个文件，JSON 格式校验通过（右下角 JSON 无红色报错）
- **复杂度**：⭐ 最低

---

#### 【任务 A2=B1】netlify.toml 新增 redirects
- **任务 ID**：A2
- **输入契约**：已有 `netlify.toml`，内含 messages/students/pending/announcements 4 条 redirects
- **输出契约**：在 toml 末尾新增 DESIGN §6.3 里的 13 条 redirects（student-login 2 + students 扩展 3 + communities 含 create-requests/join-requests 7 + direct-messages 2 = 14 条？准确按 DESIGN §6.3 列的个数）
- **实现约束**：按原 redirects 的格式（`[[redirects]]`，`from/to/status=200`），不要写错路径的通配符 `/*`；和已有的 4 条保持风格一致
- **依赖关系**：无（与 A1 可并行）
- **验收标准**：tomllib / vscode toml 插件校验无语法错误；from 路径不与已有 4 条冲突
- **复杂度**：⭐ 最低

---

### C 组：后端 functions（5 条，无依赖可并行）

---

#### 【任务 C1】students.js 扩展：密码生成 + 重置 + 批量补 + 退社
- **任务 ID**：C1
- **输入契约**：现有 `netlify/functions/students.js`（已带 titleLevel，且已把所有 `??` 改成三元兼容写法）
- **输出契约**：
  - ① 新增 `random6Digits()` 工具：6 位 0-9 纯数字，过滤连续 ≥4 位重复字符；查重（当前 students 列表里已存在则重新生成，最多 5 次，5 次失败改 7 位）
  - ② 新增 `ensureAllHasPasswords(list)`：遍历返回新 list，空 password 全部补随机 6 位
  - ③ POST `/api/students`（手动新增）自动生成 password；PUT 保留原 password（不覆盖）
  - ④ POST `/api/students/:id/reset-password`：管理员权限，重置该学生 password=新 6 位，返回 `{newPassword}`
  - ⑤ POST `/api/students/batch-fill-passwords`：管理员权限，遍历全量 list 补 password，返回 `{filledCount, total}`
  - ⑥ POST `/api/students/:id/leave-community`：同学权限（body 传 `studentName+studentPassword`），校验学生自己；如果是社长且 memberIds.length>1 → 报错「先转让社长」；否则（memberIds.length===1 最后一个成员 or 不是社长）→ 双写 `student.communityId=null` 并从 communities 中 memberIds 移除
- **实现约束**：**绝对不使用 `??` 运算符**；PUT `/students/:id` 不能把 password 覆盖掉（只能用 old 的，或若 old 空则生成新的）；与 titleLevel 字段新增逻辑无冲突
- **依赖关系**：A1（communities.json 要存在才能退社双写 memberIds）
- **验收标准**：
  - [ ] 手动新增 student，响应里有 `password` 是 6 位数字
  - [ ] 点 reset-password 返回 `{ok:true, newPassword:"..."}` 6 位
  - [ ] batch-fill 返回 filledCount=空 password 的学生数量
  - [ ] 最后一个成员的社长退社成功（返回 ok）；成员 >1 时社长退社报错
- **复杂度**：⭐⭐⭐⭐ 高（6 个子接口要写）

---

#### 【任务 C2】student-login.js：2 条身份接口
- **任务 ID**：C2
- **输入契约**：无（全新文件），复用现有其他 functions 的 `getFileContent / toBeijingTime / headers / verifyStudentByNickname(name,pass)` 结构
- **输出契约**：
  - ① POST S1 `/api/student-login`：body=`{nickname, password}` → 返回：密码对 → `{ok:true, student:{id,nickname,title,titleLevel,communityId,communityName,password}}`；密码错 → 401 `{ok:false, error:"姓名或密码不正确"}`；姓名重名 → 遍历所有同名试密码，有一个匹配就算通过（返回对应的 student）
  - ② POST S2 `/api/student-verify-session`：body=`{studentId}` → 读当前 student；存在且 password 非空 → `{ok:true, isValid:true, student:{...}}`；password 被重置（对比 session 创建时间没意义，这里只校验 student 仍然存在有密码即可，前端清 session 逻辑放在如果 student 找不到）→ 不存在 → `{isValid:false}`
- **实现约束**：**不用 `??`**；`verifyStudentByNickname(name, pass)` 重名处理按 DESIGN E6
- **依赖关系**：A1（students.json 要存在）
- **验收标准**：
  - [ ] 姓名+密码对返回 200；错密码 401
  - [ ] 两个重名学生（都叫张三），分别试各自正确密码都能通过
  - [ ] studentId 不存在时 isValid=false
- **复杂度**：⭐⭐ 中

---

#### 【任务 C3】messages.js 扩展：留言板实名校验 + 拼 name
- **任务 ID**：C3
- **输入契约**：现有 `netlify/functions/messages.js`（POST 里直接写 body.name 没校验）
- **输出契约**：
  - ① POST `/api/messages` body 新增可选 `{studentName, studentPassword}` 两个字段
  - ② 若两个字段都传了：走 `verifyStudentByNickname(name, pass)` 校验；通过 → `verifiedReal=true`，读 student 的 communityId；若 communityId 非空 → 查 communities.name → `communityName = community.name`；最终 `name = student.nickname + (communityName? "｜"+communityName : "")`
  - ③ 没传两个字段 / 校验失败 → `verifiedReal=false`，`communityId=null, communityName=""`，**强制 `name="匿名校友"` 覆盖前端传的任何 name**
  - ④ GET `/api/messages` 不变（直接返回 messages 数组）
- **实现约束**：**不用 `??`**；返回消息时，name/verifiedReal/communityId/communityName 四个字段全部存在（即使匿名也要返回）
- **依赖关系**：A1（communities.json 要存在才能查社区名）
- **验收标准（和 M4 对应）**：
  - [ ] 正确密码张三+篮球社 → 返回 `name:"张三｜篮球社" verifiedReal:true communityName:"篮球社"`
  - [ ] 正确密码张三+无社 → 返回 `name:"张三" verifiedReal:true communityName:""`
  - [ ] 故意密码错 / 不传 → 即使前端 name 字段传「我是黑客」→ 最终返回 `name:"匿名校友" verifiedReal:false`
- **复杂度**：⭐⭐⭐ 中高（和社区做 join 一次）

---

#### 【任务 C4】communities.js：7 条社区 + 审批 + 转让接口
- **任务 ID**：C4
- **输入契约**：全新文件；所有请求通过 `event.path.startsWith('/api/community-create-requests')` 之类开头判断走哪段
- **输出契约**：
  - C1 GET `/api/communities?status=active`：默认只返 active（status!=deleted）；每条带 `{id,name,description,ownerId,ownerNickname(查 student.nickname 拼上),memberCount(memberIds.length),memberIds,created_at}`
  - C2 POST `/api/community-create-requests`：同学鉴权 + 无社（一人一社校验①）→ 写 create-requests.json status=pending
  - C3 POST `/api/community-create-requests/:id/handle`：管理员；approve=true → 查 creator 无社（一人一社校验②）→ 写 communities 新记录（ownerId=creator, memberIds=[creatorId]）+ 写 creator.communityId = communityId 双写 + create-requests 变 approved；approve=false → 变 rejected + rejectReason
  - C4 POST `/api/community-join-requests`：同学鉴权 + 无社（一人一社校验③）→ 写 join-requests pending
  - C5 POST `/api/community-join-requests/:id/handle`：**社长（body 带社长 studentName+studentPassword 校验 ownerId===社长 id）或 管理员（X-Admin-Token）都可**；approve=true → 一人一社校验④学生 communityId 必须空 → memberIds.push(studentId) + student.communityId=communityId 双写 + join-request 变 approved；approve=false → rejected
  - C6 POST `/api/communities/:id/transfer-owner`：社长鉴权（body 带社长密码）→ 校验 newOwnerId in memberIds → community.ownerId = newOwnerId
  - C7 DELETE `/api/communities/:id`：管理员 → community.status='deleted' 软删；遍历 students list，所有 communityId==this.id → `communityId=null`（批量写）；所有 pending 的 create/join-requests 变 rejected
- **实现约束**：**不用 `??`**；每一处需要双写的（memberIds 与 student.communityId）必须「一个文件写完再写下一个」，下一个失败则整体抛错不提交（靠 getFileContent 的 SHA 不变就不会产生部分写）；重名社区（active 同名）审批通过时报错
- **依赖关系**：A1（4 个 JSON 都要存在）
- **验收标准（M5 全部）**：
  - [ ] 无社学生提交创建社 → create-requests 存一条 pending；管理员通过 → communities 有一条 + 学生 communityId 非空 + 是 ownerId
  - [ ] 已有社的学生再提交创建 → 直接报错「你已在 XX 社」
  - [ ] 社长审批加入 → 新人 communityId 变了；已有社的新人申请加入 → 报错
  - [ ] 社长转让给新社长（本社成员）→ ownerId 改了；转让给外社成员 → 报错「只能转让本社成员」
  - [ ] 管理员删除社 → community.status=deleted + 所有成员 communityId 空 + pending 的全 rejected
- **复杂度**：⭐⭐⭐⭐⭐ 最高（6 个 JSON 交叉读写最多）

---

#### 【任务 C5】direct-messages.js：3 条单聊接口
- **任务 ID**：C5
- **输入契约**：全新文件；`direct-messages.json` = `[{id, studentId, sender: student|admin, content, created_at, read}]` 扁平数组
- **输出契约**：
  - DM1 GET：
    - 管理员（header X-Admin-Token）→ 返回聚合对象：`conversations = {[studentId]: {studentId, studentNickname, lastMessage, lastTime, unreadCount(sender=student 且 read=false 计数), messages:[倒序 200]}}`
    - 同学（query 传 `studentId + studentPassword`）→ 校验密码正确 → 返回 `messages: [该 studentId 倒序 200]`；密码错 → 401
  - DM2 POST：
    - 管理员（token）→ body `{targetStudentId, content}` → 写 `sender=admin, studentId=targetStudentId` → 超过 500 条清理最老到 450
    - 同学（body `{studentName, studentPassword, content}`）→ 校验通过 → 写 `sender=student, studentId` → 同样清理
  - DM3 POST `/api/direct-messages/mark-read`：管理员 → `{studentId}` → 该学生所有 `sender=student` 的消息 read=true，返回 markedCount
- **实现约束**：`studentNickname` 聚合时要到 students.json 查对应 nickname；消息 content 最大 1000 字（超长截断）；**不用 `??`**
- **依赖关系**：A1（direct-messages.json + students.json 存在）
- **验收标准（M3）**：
  - [ ] 同学发 1 条 → 管理员 GET conversations 里 unreadCount=1；管理员进入会话 mark-read → unreadCount=0；管理员回复 1 条 → 同学 GET messages 里能看到 sender=admin
  - [ ] 同学故意传错密码 POST → 401；查不到 studentId 的会话 → 404
- **复杂度**：⭐⭐⭐ 中

---

### D 组：前端核心基础（4 条，有严格依赖）

---

#### 【任务 D1】CSS 升级：色号 6 档（亮银 2 提亮 + 赤红字体 4 + 天蓝耀眼 5）
- **任务 ID**：D1
- **输入契约**：index.html 中 `.student-name.title-gold/silver/bronze` 3 档 + `.inline-title-badge.badge-gold/silver/bronze` + `.title-detail-badge.*` 3 套 CSS
- **输出契约**：
  - ① 覆盖 `.student-name.title-silver`（原 `#FAFAFA → #E0E0E0 → #BDBDBD`）**改成 `#FFFFFF → #F5F7FA → #CFD8DC`**（提亮 + 偏青白 + 银边 `#B0BEC5` + 字 `#263238`）
  - ② 新增 `.student-name.title-red-font`（titleLevel=4）：背景 `#FFF9F9 → #FFEBEE` 淡粉；**字体 `#C0392B 粗体 color + text-shadow 0 0 1px`** + 描边 `1.5px solid #E74C3C`
  - ③ 新增 `.student-name.title-blue-shine`（titleLevel=5）：背景 `#E3F2FD → #29B6F6 → #0277BD` + **外发光阴影 `0 0 14px rgba(41,182,246,0.55)`** + 字体 `#FFF 粗体` + 描边 `1.5px solid #01579B`
  - ④ 同步改 `.inline-title-badge.badge-silver` 亮蓝灰；新增 `.inline-title-badge.badge-red-font` （赤红徽章背景 `#C62828`）和 `.badge-blue-shine`（天蓝 `#039BE5` 发光）
  - ⑤ 同步改 `.title-detail-badge.badge-silver`；新增 `.badge-red-font` / `.badge-blue-shine` 对应详情页大徽章
  - ⑥ 管理员表单色号下拉：4 项 → 6 项（增加「🔴 赤红名字（字体赤红）」和「🔵 天蓝耀眼（背景发光）」），预览小方块同步加 2 个
- **实现约束**：所有 class 名字在 template 里对应 `:class="{title-red-font: level===4, title-blue-shine: level===5}"`；不要漏写三处 class（名录/inline徽章/detail 大徽章）
- **依赖关系**：A1（后端 students 支持 0-5 level，但前端改 CSS 不依赖后端，可与 C1-C5 并行）
- **验收标准（M1 前 3 条）**：
  - [ ] 选 level=4 → 姓名框赤红字体+描边+淡粉背景（不是全红背景）
  - [ ] 选 level=5 → 姓名框天蓝渐变+外发光+白字
  - [ ] 银色明显比修改前更亮（#CFD8DC 而非 #9E9E9E 的灰暗）
- **复杂度**：⭐⭐ 中（只改 CSS 和 template 的 :class 绑定）

---

#### 【任务 D2】studentSession 内存态 + 身份验证卡片 UI
- **任务 ID**：D2
- **输入契约**：index.html `<script>` 顶部有 `studentsStore / pendingStore` 等 reactive；HomePage 组件在顶部 banner-area 有 `announcement-banner`
- **输出契约**：
  - ① 新增 `const studentSession = reactive({loggedIn:false, studentId:null, nickname:"", title:"", titleLevel:0, communityId:null, communityName:"", password:"", isOwner:false})`
  - ② 新增 `refreshStudentSession()` 函数：if sessionStorage['cengfan.student.session'] → 读 `{studentId}` → 调 S2 `POST /api/student-verify-session` → 成功则写 studentSession 全部字段 + 计算 `isOwner = communitiesStore.list.some(c=>c.ownerId===studentId)` → 失败则 sessionStorage.removeItem 并清空
  - ③ 身份卡片 HTML：banner 下方新增 1 块
    - 未登录：`📇 身份验证` 卡，2 输入框（姓名+密码）+ 验证按钮；点击 → 调 S1 POST `/api/student-login` → 成功 → 写 studentSession + 写 sessionStorage（`{studentId, verifiedAt}`）
    - 已登录：✅ 绿卡样式 + 「张三 已实名｜您的密码：123456｜所属社区：篮球社（若有，空则不显示这部分）｜退出登录按钮（清 session+sessionStorage）」
  - ④ `onMounted` 时调用 `refreshStudentSession()` + 5s 轮询里也调用（如果当前 loggedIn）一次刷新所属社区名称等最新数据
- **实现约束**：sessionStorage 只存 studentId + verifiedAt，**不存明文 password**（安全！密码只在 studentSession 内存态里显示一会儿，刷了靠 verify-session 再查，C2 S2 返回 student 对象含 password 再显示）
- **依赖关系**：C2（student-login.js 要部署）
- **验收标准（M2 §6/§6）**：
  - [ ] 输对密码→身份卡显示密码明文+社区（若在社）
  - [ ] 刷新页面（按 F5）→ 身份卡仍然显示（sessionStorage 生效，Q4 B 档）
  - [ ] 关了浏览器标签页再打开同网址 → 身份卡消失（要重输，Q4 B 档）
- **复杂度**：⭐⭐⭐ 中高

---

#### 【任务 D3】管理员 Tab4：密码管理 + 重置 + 批量补全
- **任务 ID**：D3
- **输入契约**：AdminPage 的 tabs 数组已扩到 9；currentTab===4 时渲染；DataProvider 需新增 3 个方法
- **输出契约**：
  - ① DataProvider 新增：
    - `resetStudentPassword(id)` → `POST /api/students/:id/reset-password`
    - `batchFillStudentPasswords()` → `POST /api/students/batch-fill-passwords`
    - `listStudentsWithPasswords()` → GET `/api/students`（已有）并加一行「空密码人数」统计显示
  - ② Tab4 顶部按钮：「🔧 批量补全所有空密码」；点击 → 调 batchFill → 弹 alert「成功补全 12 个同学密码」
  - ③ Tab4 表格：列「序号 / 姓名 / 大学 / 专业 / 密码（6 位数字，大字号粗体居中）/ 操作（重置密码按钮）」
  - ④ 重置按钮：点 → confirm「确定重置 XXX 的密码吗？」→ resetStudentPassword → alert「新密码：XXXXXX」并刷新表格
- **实现约束**：密码列只管理员能看到（AdminPage 内，不用担心泄露到主页）
- **依赖关系**：C1（ST1 ST2 接口要存在）+ D2（但管理员不需登录 studentSession，只依赖 C1）
- **验收标准（M2 §4/§5）**：
  - [ ] 表格显示密码都是 6 位数字
  - [ ] 批量补返回 filledCount 正确；重置返回的新密码 6 位且刷新显示正确
- **复杂度**：⭐⭐ 中

---

#### 【任务 D4】留言板渲染：实名徽章 + 社区徽章
- **任务 ID**：D4
- **输入契约**：主页 messages Store 里每条现在有 `{name, content, created_at}`
- **输出契约**：
  - ① 每条消息左上方新增「角标区」：
    - `verifiedReal=true 且 communityName 非空` → 绿色 ✅ 已实名 + 蓝色 🔷「篮球社」社区徽章
    - `verifiedReal=true 且 communityName 空` → 只显示绿色 ✅ 已实名
    - `verifiedReal=false` → 灰色「匿名」角标（替换现在的匿名校友图标）
  - ② name 字段**后端返回什么就显示什么**：显示「张三｜篮球社」或「张三」或「匿名校友」，前端绝不自己根据 session 拼
  - ③ 发送消息时（用户提交按钮）：若 studentSession.loggedIn=true → 自动带 `studentName+studentPassword`（从 session 取 student.nickname + password）传给 messages POST
- **实现约束**：name 直接用 `{{msg.name}}`；如果前端自己拼 name 视为任务失败（要通过后端防绕过测试）
- **依赖关系**：C3（messages.js POST 新增字段）+ D2（有 studentSession 取）
- **验收标准（M4 §7/§8/§9 + M6 全部）**：
  - [ ] 实名在社 → 张三｜篮球社 + 绿标 + 蓝社标
  - [ ] 实名无社 → 张三 + 绿标
  - [ ] 未验证 → 匿名校友 + 灰标
- **复杂度**：⭐⭐ 中

---

### E 组：社区板块（5 条，依赖 D2）

---

#### 【任务 E1】主页社区信息卡 UI（CommunitiesCard）
- **任务 ID**：E1
- **输入契约**：主页右栏 info-card 有 统计 / 公告 / 留言板 / 聊天板 4 张；现在新增第 5 张「🏘️ 社区板块」
- **输出契约**：
  - ① DataProvider 新增 `listCommunities()` → GET `/api/communities`，写入 `communitiesStore.list = reactive([])`
  - ② 社区信息卡上半：活跃社区列表（卡片式，每个显示：社名、简介、社长名、成员数 `memberCount`）
  - ③ 社区信息卡下半：
    - 当前无社且已实名 → 两个按钮亮：「📝 申请创建社区」「➕ 申请加入社区（弹窗里选社）」
    - 当前有社 → 灰掉按钮并显示文字「你已加入『XX社』，如需换社请先退出当前社」；身份卡上显示退出按钮（走 ST3 leave-community 接口）
    - 当前未实名 → 两个按钮灰并显示「请先完成身份验证才能参与社区」
- **依赖关系**：C4 C1（GET communities）+ D2（session 有 communityId 判断）
- **验收标准（M5 §10）**：
  - [ ] 未实名灰、有社灰、无社亮；列表正确显示活跃社区（不含软删的）
- **复杂度**：⭐⭐ 中

---

#### 【任务 E2】申请创建 / 申请加入弹窗
- **任务 ID**：E2
- **输入契约**：E1 两个按钮
- **输出契约**：
  - ① 申请创建弹窗：「社区名（≤20 必填）」+「简介（≤200 选填）」+ 提交 → POST C2 `/api/community-create-requests`（自动 body 带 studentName+studentPassword）→ 成功提示「创建申请已提交，请等待管理员审批」
  - ② 申请加入弹窗：下拉框选社（从 communitiesStore.list 取 name）+ 提交 → POST C4 `/api/community-join-requests`（带 studentName+studentPassword + communityId）→ 成功提示「加入申请已提交，请等待社长审批」
  - ③ 已有社且是社长，身份卡额外显示 1 个按钮：「🪑 进入社长面板」→ 打开 E4 弹窗
- **依赖关系**：C4 + D2 + E1
- **验收标准**：提交后对应 requests.json 有 pending 记录
- **复杂度**：⭐⭐ 中

---

#### 【任务 E3】管理员 Tab5：创建社区审批
- **任务 ID**：E3
- **输入契约**：AdminPage Tab5；DataProvider 新增 listCreateRequests / handleCreateRequest(id, approve, rejectReason)
- **输出契约**：
  - Tab5 显示所有 create-requests，按时间倒序，列：申请人 / 申请社名 / 简介 / 状态 / 操作
  - 操作：pending 的两条按钮「✅ 通过」「❌ 拒绝（弹输入 rejectReason）」；点击 → C3 `/api/community-create-requests/:id/handle` → success 刷新
- **依赖关系**：C4 C3
- **验收标准（M5 §11）**：通过后自动创建社且创建者自动成为社长+成员
- **复杂度**：⭐⭐ 中

---

#### 【任务 E4】社长面板 + 管理员 Tab7（加入社审批汇总）
- **任务 ID**：E4
- **输入契约**：
  - 社长面板（同学社长入口，D2 身份卡的「进入社长面板」按钮）
  - 管理员 Tab7：所有 pending 的 join-requests 跨社汇总（管理员也可直接审批）
- **输出契约**：
  - 社长面板 3 个 Tab：① 本社成员列表（名字+踢人按钮？本期不做踢人，只显示）② 待审批加入申请列表（✅同意 / ❌拒绝）③ 转让社长（下拉选本社成员 + confirm 2 次）
  - 管理员 Tab7：跨社所有待审批 join-requests 列表，列：社区名 / 申请人 / 申请时间 / 操作（同意/拒绝）
  - 接口：C5 POST `/api/community-join-requests/:id/handle`（社长带自己密码、管理员带 token）；C6 POST `/api/communities/:id/transfer-owner`（社长密码 + newOwnerId）
- **依赖关系**：C4 C5 C6 + D2
- **验收标准（M5 §12/§13）**：
  - [ ] 社长审批加入 → 新人社区信息卡立即刷新（5s 轮询）
  - [ ] 社长转让成功 → 旧社长身份卡的「进入社长面板」消失；新社长出现入口
- **复杂度**：⭐⭐⭐ 中高

---

#### 【任务 E5】管理员 Tab6：社区管理列表 + 删除
- **任务 ID**：E5
- **输入契约**：AdminPage Tab6；DataProvider 新增 `deleteCommunity(id)` → DELETE C7 `/api/communities/:id`
- **输出契约**：
  - Tab6 列：社区名 / 社长名 / 成员数 / 创建时间 / 状态 / 操作
  - 操作：active 的社有「🗑️ 删除」按钮 → confirm「该社有 12 名成员，删除后所有成员将无社，确定吗？」→ deleteCommunity → success 刷新列表
  - 软删状态 deleted 的显示灰色「已删除」，不在 Tab6 列表（或放在单独折叠区）
- **依赖关系**：C4 C7
- **验收标准（M5 §14）**：删除后对应所有成员的 communityId 变空 + 能再申请其他社
- **复杂度**：⭐⭐ 中

---

### F 组：单聊（3 条）

---

#### 【任务 F1】主页：同学单聊管理员弹窗
- **任务 ID**：F1
- **输入契约**：同学已实名（D2 loggedIn=true）；身份卡下方显示「💬 联系管理员」按钮
- **输出契约**：
  - 弹窗内容：
    - 顶部：会话标题「同学对话管理员」
    - 中部：消息列表（倒序或正序？正序按时间从旧到新显示，和微信一致）；同学消息显示右侧蓝气泡；管理员回复左侧灰气泡；每条带时间
    - 底部：输入框（textarea，max 500）+ 发送按钮
  - 接口：GET DM1（query studentId+studentPassword）+ POST DM2（body `{studentName, studentPassword, content}`）
  - 每 5 秒轮询刷新一次当前同学的 messages
- **依赖关系**：C5 DM1/DM2 + D2（要 studentName+password 发）
- **验收标准（M3 同学端）**：发的消息管理员端能看到，管理员回复同学能看到（5 秒延迟）
- **复杂度**：⭐⭐ 中

---

#### 【任务 F2】管理员 Tab8：单聊收件箱
- **任务 ID**：F2
- **输入契约**：AdminPage Tab8；DataProvider 新增 `listConversations()`（GET DM1 管理员视角）+ `postAdminMessage(targetStudentId, content)`（POST DM2）+ `markConversationRead(studentId)`（POST DM3）
- **输出契约**：
  - 左栏：会话列表（同学头像占位 / 姓名 / 最新消息 12 字 / 未读红点 count）；未读 >0 的排最上面
  - 右栏：当前会话消息列表（和 F1 一样正序气泡）+ 输入框 + 发送按钮
  - 点击左栏某个同学 → 立即调 `markConversationRead` 把红点清掉
- **依赖关系**：C5 DM1/DM2/DM3
- **验收标准（M3 管理员端）**：
  - [ ] 同学发消息后 5 秒内管理员这边未读红点出现；点进去红点消失
  - [ ] 管理员回复发送成功，同学端 5 秒内刷新看到回复
- **复杂度**：⭐⭐⭐ 中高（左右分栏 + 聚合）

---

#### 【任务 F3】发送消息 + 清理上限 500
- **任务 ID**：F3
- **输入契约**：F1 和 F2 都有发送按钮
- **输出契约**：
  - 发送前校验 content 非空（trim 后长度>0）；超长截断到 1000 字并提示
  - 发送成功后：立即 append 到当前 messages 列表（乐观更新），不等待下一轮 5s 轮询
  - 接口返回时如果有 `cleanedOldCount`（后端清理老消息时返回），前端提示「会话过长，已自动清理最早的 N 条消息」
- **依赖关系**：F1 + F2
- **验收标准**：发送无报错，乐观更新立即显示自己刚发的消息
- **复杂度**：⭐ 低

---

### G 组：质量门控（2 条）

---

#### 【任务 G1】移动端适配所有新 UI @media ≤768px
- **任务 ID**：G1
- **输入契约**：已存在的 `@media (max-width: 768px)` 块
- **输出契约**：对以下新增 UI 加移动适配，不允许出现横向滚动条：
  - ① 身份卡片：姓名 / 密码 / 社区信息 纵向排列换行
  - ② 社区信息卡：社区卡片纵向堆叠，每卡 100% 宽
  - ③ 密码管理 Tab4 表格：`display:block` + 行滚动 / 或小屏改卡片列表（避免 5 列表横向溢出）
  - ④ 单聊收件箱 Tab8：左栏 40% 右栏 60%（≤480px 时改为上下堆叠）
  - ⑤ 社长面板 / 创建审批弹窗：弹窗最大 width calc(100% - 20px)
  - ⑥ 顶端公告横幅之前已写好的纵向换行不能被新 CSS 覆盖破坏（最后验证）
- **依赖关系**：D1/D2/D3/E1/F2 全部的 UI 已经完成
- **验收标准**：DevTools iPhone 12 尺寸浏览，所有新 UI 无横向滚动条、无按钮溢出、顶端公告完整换行
- **复杂度**：⭐⭐ 中

---

#### 【任务 H1】全链路 16 条验收回归测试
- **任务 ID**：H1
- **输入契约**：所有 A1~G1 任务全部完成
- **输出契约**：创建 `docs/community-pass-upgrade/ACCEPTANCE_社区密码升级.md`，逐条打勾记录 CONSENSUS §4 的 16 条验收标准的测试结果，截图粘贴或文字描述通过；不通过的写明失败位置 + 原因 + 修复 commit
- **依赖关系**：G1（移动端必须过，否则第 17 条兼容项失败）
- **验收标准（质量最终交付）**：16 条全 ✅ 且 2 条兼容项 ✅；没有出现老功能回归（如档案删除/公告编辑仍正常工作）
- **复杂度**：⭐⭐⭐ 中（测试工作耗时）

---

## 3. 可并行组（供未来自动化调度用）

| 并行组 | 任务 | 说明 |
|---|---|---|
| G0（最前置，一起提交）| A1 + A2 | 都不依赖 |
| G1（后端组，可并发写 5 个 functions）| C1 + C2 + C3 + C4 + C5 | 5 个 functions 文件独立（文件级不冲突）|
| G2（前端基础 + 色号并行 C4）| D1（只改 CSS）| 与后端 G1 可完全并行 |
| G3（前端核心 1）| D2 → D3 → D4 | 串行链 |
| G4（前端核心 2）| E1 → E2 → (E3 || E4) → E5 | E3 E4 可并行 |
| G5（前端核心 3）| F1 + F2 → F3 | F1 F2 可并行，F3 最后 |
| G6 交付 | G1 → H1 | |

---

## 4. 复杂度评估与风险登记

| 风险编号 | 描述 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|---|
| R1 | C4 communities.js 双写不一致（写 communities 成功但写 students 失败 SHA 冲突）| 成员 communityId 变了 memberIds 没加 → 数据不一致 | 中（20%）| 每个写操作都 wrap 在 3 次 retry 的 fetchWithRetry 内；最后用 `validateCommunityConsistency(list, community)` 校验函数在 response 返回前做一次 `memberIds.forEach(id=>students[id].communityId===this.communityId)` 并报错；管理员 Tab6 加「数据校验修复」按钮一键恢复一致性 |
| R2 | 姓名重名导致 verifyStudent 选错人（两个张三密码相同 → 登录返回第一个）| 低概率 | 中（15%）| 管理员 Tab4 新增「重名警告」列：高亮显示 nickname 重复的同学，提示管理员改名字 |
| R3 | 6 位纯数字密码被暴力猜（网站公开访问的话 100 万组合可以被脚本刷）| 中风险 | 低（10%，小圈子网站量少）| 后端 messages POST + 所有同学写接口加「同 IP 1 分钟最多 10 次」IP 限流（用 Map 存内存计数，重启 functions 丢失但够用，Netlify 冷启动影响不大）|
| R4 | 移动端新增 UI 导致顶端公告被挤到最上面看不到（用户明确要求顶端公告要完整显示）| 影响用户核心要求 | 中（15%）| G1 任务里最后验收加一条专门的：「iPhone 12 尺寸 → 顶端公告横幅位置在 banner 区第一屏，不被其他内容挡；长公告文字完整换行不截断」|
| R5 | 社长转让后前社长还能看到社长面板入口（isOwner 字段没刷新）| 体验 BUG | 中（20%）| 每次转让成功后立即全量调 `refreshStudentSession()` 重拉 studentSession 所有字段；5s 轮询也会修正 |
