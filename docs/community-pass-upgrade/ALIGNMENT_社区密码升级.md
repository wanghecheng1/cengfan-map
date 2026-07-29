# ALIGNMENT_社区密码升级 v1.0

> 任务：同学密码系统 + 实名留言 + 单聊管理员 + 社区（创建/审批/社长转让/一人一社区）+ 姓名框扩展色号
> 项目：层饭地图 cengfan-deploy（Netlify Functions + GitHub API 存储）

---

## 1. 原始需求（逐字）

1. 管理员可以将同学的名字改成**赤红色**
2. 姓名框的**银色要亮一点**，**增加天蓝色姓名框，耀眼一点**
3. 添加**密码分配功能**：后台随机给每个同学分配不一样的密码，管理员能查看；**为每个同学添加单独联系管理员的后台聊天**
4. **留言板姓名系统**：输入同学姓名 + 同学密码，只有对应成功的才可以以**实名制**发言，后者一律只能以**匿名制**发言
5. **增加社区板块**：
   - 同学通过正确输入密码和姓名，可以向管理员申请**创建社区**
   - 同学之后**加入社区**也需要输入同学姓名和密码，且需要经过**社长同意**
   - 由创建社区的人成为**社长**，社长可以**转让**给社区内的同学
   - 管理员可以**删除社区**
   - 社区板块显示**已创建的社区**和**申请创建** / **申请加入**的入口
   - **一个人只能选择一个社区**
6. **留言板显示**：同学通过正确输入密码和姓名后，如果他在社区中，就显示**姓名和社区名称**；如果不在，就不显示社区

---

## 2. 对现有项目的理解

### 2.1 当前技术栈与架构

| 层 | 现状 |
|---|---|
| 前端 | Vue3（CDN ESM）+ 单页 index.html（app/home/admin-login/admin/message 5 个 page 组件）|
| 后端 | Netlify Functions：`students.js`、`pending.js`、`announcements.js`、`messages.js`、`admin-login.js`（5 个）|
| 存储 | **GitHub 仓库 JSON 文件**（`data/*.json`），通过 `GITHUB_TOKEN + GITHUB_REPO + GITHUB_BRANCH` 三环境变量驱动 |
| 鉴权 | 管理员：X-Admin-Token header，密码在 `ADMIN_PASSWORD` 环境变量；**同学无鉴权**（当前是匿名）|
| 工具函数 | 5 个 functions 各有自己的 copy：`headers / verifyAdmin / githubRequest / getFileContent / writeFileContent / fetchWithRetry / toBeijingTime`（有重复代码但工作正常）|
| 前端公共 | `DataProvider`（fetchWithRetry 3 次重试 + 永不降级本地，401 弹管理员登录）|

### 2.2 已有数据结构（`data/` 下 6 个 JSON 文件）

- `students.json`：学生档案数组（当前字段：`id / nickname / province / city / university / major / hobbies / looking_for_food / longitude / latitude / wechat / qq / title / titleLevel / created_at`）— **本次要加 `password / communityId` 两个重要字段**
- `pending.json`：待审核申请（已有结构）
- `announcements.json`：公告（`id / title / content / pinned / created_at / updated_at`）
- `messages.json`：**公开留言板**（当前字段：`id / content / name / created_at`，name 可以是「匿名校友」）
- `data.json`：地图（未动）

### 2.3 已有 5 个 API（functions）

| Method | Path | 鉴权 | 功能 |
|---|---|---|---|
| GET/POST/PUT/DELETE | `/api/students` + `/:id` | 管理员（写操作）| 学生档案 CRUD（已带 titleLevel）|
| GET/POST/DELETE | `/api/pending` + `/:id` | 管理员（写）| 申请审核 |
| GET/POST/PUT/DELETE | `/api/announcements` + `/:id` | 管理员（写）| 公告 CRUD（PUT 刚修好）|
| GET/POST/DELETE | `/api/messages` + `/:id` | 管理员（删）| **公开留言板**（当前实名/匿名只由前端 name 决定，**后端没验证**）|
| POST | `/api/admin-login` | - | 管理员登录校验（返回 token，密码=环境变量）|

### 2.4 已有 UI（5 个 page 组件）

1. `HomePage`（主页）：三栏布局（左同学名录 / 中地图 / 右卡片：统计+公告+留言板+聊天板+申请入口）
2. `MessagePage`（聊天板）：聊天板实名
3. `ApplyPage`（申请档案）：申请入口（wx/qq/hobbies/饭搭子）
4. `AdminLoginPage`：管理员登录
5. `AdminPage`：标签页（待审核 / 全部档案 / 找饭搭子 / 公告管理）→ **本次至少新增 5 个标签：同学密码管理 / 单聊会话列表 / 社区创建审批 / 社区列表 / 全局聊天记录**

---

## 3. 需求边界确认（明确本次做什么 / 不做什么）

### 3.1 ✅ 本次必须做（IN-SCOPE）

| # | 需求点 | 范围约束 |
|---|---|---|
| C1 | 赤红色姓名框 | 扩展 titleLevel 色号 |
| C2 | 银色调亮 + 新增耀眼天蓝色（青蓝渐变）| 扩展 titleLevel 色号，全 6 档 |
| C3 | 同学密码随机生成 + 管理员查看列表 | 密码 8 位字母数字混合；只有**管理员可见全部同学密码**（同学端看不到自己的密码？还是需要显示？→ 待确认 Q1）|
| C4 | 每个同学单独对管理员的**后台单聊**（同学→管理员 一对一）| 会话列表 + 消息；消息方向：`from=studentId\|admin`，`to=studentId\|admin`；管理员页面有统一收件箱（按同学分会话） |
| C5 | 留言板实名验证 | 后端 `/api/messages` POST 新增参数 `studentName + studentPassword`，后端校验：**通过→存实名 name=真实姓名+（若有社区就加社区名）**；不通过→强制 name="匿名校友"（后端说了算，前端不能绕过）|
| C6 | 社区板块：创建申请（需姓名+密码）→ 管理员通过 | 创建申请表（`id / creatorStudentId / name / description / status=pending|approved|rejected / created_at / handled_at`）|
| C7 | 社区板块：加入申请（需姓名+密码）→ 社长同意 | 加入申请表（`id / studentId / communityId / status=pending|approved|rejected / created_at`）|
| C8 | 社长转让（社长→社区内任一同学）| 接口：`POST /api/communities/:id/transfer`，body: `{newOwnerId, studentName, studentPassword}` |
| C9 | 管理员删除社区（会把该社区所有成员的 `communityId` 置空）| `DELETE /api/communities/:id`（需管理员）|
| C10 | 一人只能加入一个社区（前端限制 + 后端硬限制）| 后端在加入申请/创建社区校验：若 `students[].communityId != null/空` → 拒绝 |
| C11 | 前端主页右栏新增「社区」标签页卡片：已创建社区列表 + 申请创建入口 + （已实名+无社区时）申请加入入口 |  |
| C12 | 留言板（messages POST）返回消息显示：实名 + 在社区 → 显示「张三｜XX 社」；实名 + 无社区 → 只显示「张三」；未实名 → 「匿名校友」 | 由**后端 messages POST 返回时写回**，前端直接显示，不自己拼（防止绕过）|

### 3.2 ❌ 本次不做（OUT-OF-SCOPE，避免过度设计）

- ❌ WebSocket 实时推送：所有消息/申请/审批全部用「轮询 + 手动刷新」（和现有 messages / announcements 行为一致，避免引入新依赖 Socket.IO）
- ❌ 同学对同学单聊（P2P）：只做「同学 ⇄ 管理员」的 1:1
- ❌ 社区内群聊（下次可扩展）：本期社区只做**成员管理、申请审批、社长转让**，不做群消息
- ❌ 社区公告 / 社区头像 / 社区封面（本次不做 UI）
- ❌ 密码找回 / 重置邮件 / 短信：管理员直接在后台点「重置密码」生成新 8 位
- ❌ 多社区切换：一人一社区，没有切换逻辑
- ❌ 社区内职位（副社长/管理员）：只保留社长角色
- ❌ 密码 hash：考虑管理员需要查看密码明文（需求 3 明确说「管理员能查看」），所以**密码明文存 GitHub JSON**（注：这是用户需求，不是安全最佳实践；如果 GitHub 仓库是 Private，可接受）

---

## 4. 新增数据模型草稿（未最终定，放入 DESIGN 细化）

### 4.1 students.json 新增 2 字段

```javascript
{
  ...原字段,
  password: "A8k2xQ9b",       // 8位随机字母数字（大小写？待确认 Q2），创建时由后端生成，管理员可重置
  communityId: 1722240000000, // null=未加入社区；非空=当前所在社区ID（一人一社区）
}
```

### 4.2 `data/communities.json`（新增文件）

```javascript
[
  {
    id: 1722240000000,         // Date.now()
    name: "北京饭搭子社",       // 必填，最长 20
    description: "北京地区找饭搭子/探店",
    ownerId: 1680000000001,    // 社长的 student.id（创建人初始为社长）
    memberIds: [1680000000001, 1680000000002], // 社员（含社长）
    created_at: "2026-07-29 20:00",
    status: "active"           // active / deleted（软删）
  }
]
```

### 4.3 `data/community-join-requests.json`（新增文件）

加入申请（一人一社区约束在这里校验）：

```javascript
[
  {
    id: 1722240000001,
    studentId: 1680000000005,      // 申请人
    communityId: 1722240000000,    // 目标社区
    status: "pending",             // pending / approved / rejected
    created_at: "2026-07-29 20:05",
    handled_at: "2026-07-29 20:10",
    handled_by: "owner"            // owner（社长审批）/ admin（也可管理员直接审批）
  }
]
```

### 4.4 `data/community-create-requests.json`（新增文件）

创建社区申请（管理员审批）：

```javascript
[
  {
    id: 1722240000002,
    creatorStudentId: 1680000000006,
    communityName: "天津考研互助社",
    description: "天大/南大考研党互相监督打卡",
    status: "pending",            // pending / approved / rejected
    created_at: "2026-07-29 20:10",
    handled_at: null,
    rejectReason: ""              // 拒绝时填
  }
]
```

### 4.5 `data/direct-messages.json`（新增文件）

同学和管理员的单聊消息（按会话分组）：

```javascript
[
  {
    id: 1722240000003,
    studentId: 1680000000001,   // 对应的同学ID（会话就是 studentId 维度）
    sender: "student",          // "student"（同学发） | "admin"（管理员回复）
    content: "管理员好，我想改一下大学名字",
    created_at: "2026-07-29 20:15",
    read: false                 // 管理员已读（优化用，不强制）
  }
]
```

### 4.6 `data/messages.json` 扩展 1 字段

公开留言板（C5/C12）：

```javascript
{
  ...原字段,
  verifiedReal: false,    // true=后端通过姓名+密码校验过是实名；false=匿名（前端不能改）
  communityId: null,      // 如果 verifiedReal=true 且有社区，则同时存社区ID（方便未来过滤）
  communityName: "北京饭搭子社"  // 后端写回冗余字段（避免 join，保持静态），无社区时 ""
}
```

---

## 5. 色号升级映射（**已按用户 Q3 答案修正**：赤红=字体赤红色 + 描边；天蓝=耀眼蓝渐变背景；银=提亮）

**当前 4 档 → 升级为 6 档**（向后兼容，level 0-3 不影响老数据）：

| level | 含义 | 姓名框**背景色**（background）| 姓名框**字体色/描边**（color / border） | 徽章颜色 | 来源 |
|---|---|---|---|---|---|
| 0 | 正常色（无等级）| 米黄 `#F8F8F6`（不变）| 深棕字 + 透明边（不变）| 旧橙金渐变（不变）| 旧 |
| 1 | 🥇 金色（不变）| 金黄渐变 `#FFF3B0 → #FFD700 → #FFB300`（不变）| `#5A3A00` 深金字 + 金橙描边 | 深金橙 `#FF8F00` | 旧 |
| 2 | 🥈 **亮银色**（本次提亮！）| **提亮：`#FFFFFF → #F5F7FA → #CFD8DC`**（原来太灰，现在偏亮青白，更有金属感）| **`#263238` 深青灰字 + `#B0BEC5` 银边** | **亮蓝灰 `#546E7A`**（之前 `#757575` 太旧）| **改（需求2：银色要亮一点）** |
| 3 | 🥉 铜色（不变）| 棕铜渐变 `#F5DEB3 → #CD7F32 → #A0522D`（不变）| `#FFF8EC` 米白字 + 深棕边 | 深棕 `#8B4513` | 旧 |
| **4** | **🔴 赤红字体（本次新增！）**| **米白底（或浅粉淡色，不抢注意力）：`#FFF9F9 → #FFEBEE`**（背景淡粉渐变，不浓）| **`#C0392B 粗体` 赤红色字体 + `#E74C3C` 赤红描边 1.5px + 轻微阴影**（需求1原文：「将同学的**名字**改成赤红色」→ 名字是字体色，不是背景）| **赤红 `#C62828`** | **新（需求1）** |
| **5** | **🔵 耀眼天蓝色背景（本次新增！）**| **耀眼蓝渐变 + 外发光：`#E3F2FD → #29B6F6 → #0277BD` + box-shadow 发光 `0 0 14px rgba(41,182,246,0.55)`**（需求2原文：「增加天蓝色姓名框，耀眼一点」→ 天蓝是背景，要耀眼加阴影发光）| **`#FFFFFF` 纯白粗字 + 深蓝描边 `#01579B` 1.5px**（亮背景用白字，对比清晰）| **亮蓝 `#039BE5`** | **新（需求2：增加天蓝色耀眼）** |

> 管理员表单下拉框从 4 项 → 6 项，对应上面 6 档。

---

## 6. 前端身份会话（需求3/4/5的关键：「同学端身份」）

前端必须有一个「当前已实名身份」的**临时会话**（存在内存，不存 localStorage，刷新失效），用于：
- 留言板自动带验证参数
- 单聊管理员（确认是哪个同学发的）
- 社区创建 / 加入申请（确认是哪个同学申请的）

### 6.1 内存态结构（Vue reactive，不持久化）

```javascript
const studentSession = reactive({
  loggedIn: false,
  studentId: null,
  nickname: "",
  communityId: null,
  communityName: "",
  lastVerifiedAt: null
});
```

### 6.2 验证入口（新增的 UI）

- 留言板/单聊/社区入口处放一个「**身份验证**」区域：姓名输入框 + 密码输入框 + 验证按钮
- 调用新接口 `POST /api/student-login`（body: `{nickname, password}`）
  - 200 → 返回 `{ok:true, student:{id,nickname,title,titleLevel,communityId,communityName}}` → 写入内存态 `studentSession`
  - 401 → 返回 `{ok:false, error:"姓名或密码不正确"}`
- 验证成功后，**留言板自动显示「正在以 XXX 实名发言」**
- 未验证 → 一律匿名（前端给提示，但后端会强制兜底，所以前端骗不了）

> 【待确认 Q4】刷新之后是否需要「记住我 7 天」？还是「每次都要重新验证」？（为了安全默认每次都要，避免别人捡了手机直接用）

---

## 7. 智能决策（**已按 Q1-Q5 用户答案修正**）

| 编号 | 决策点 | 决策结果（**最终版，不再改动**）| 依据 / 风险 |
|---|---|---|---|
| D1 | 密码存储方式 | **明文存储**（6 位数字，管理员 + 同学验证成功后都能看到）| Q1=B 同学能看；需求3 管理员能看；GitHub Private；小圈子场景可接受 |
| D2 | 密码长度 + 规则 | **6 位纯数字**（0-9，100 万种组合；用 `crypto.randomInt` 生成）| Q2=A 好记；同学线下容易抄在手机备忘录 |
| D2b | 密码过滤规则 | **过滤前导 0（可选，我默认保留前导 0，6 位都可能出现）**；避免连续重复 >3 位（例如 111111 不生成）| 降低「123456/111111」这类密码出现概率，但不做强制，否则代码复杂 |
| D3 | 新同学密码生成时机 | **两处生成**：① POST /students（手动新增）生成；② approve 通过申请时生成；③ 老学生空密码：管理员后台点「批量补密码」一次全生；④ 点「重置密码」按钮单人生成；**后端保证全 student 永远有 password（null 强制生成）**| 避免老学生空密码没法实名 |
| D4 | 单聊消息存储 | 单独 `direct-messages.json`，扁平数组按 `studentId` 分会话；每次取按 `studentId + created_at` 倒序 200 条 | 和现有 messages.json 风格一致 |
| D5 | 社区成员双写 | `communities.memberIds[]` + `students.communityId` 同时写；校验失败则事务回滚（写 GitHub 两个文件时，失败 1 个则整体报错不提交）| 查两种视图都快 |
| D6 | 一人一社区硬限制 | 后端 3 处强校验：① 创建社审批通过（creator 必须无社）② 加入审批通过（申请人必须无社）③ POST /students 更新 communityId 时只能非空→空 或 空→非空 | 前端同步灰掉按钮做软限制 |
| D7 | 留言板 name 显示规则 | **后端 `/api/messages` POST 返回前拼装好 name 字段**：if verifiedReal=true → name = student.nickname + (communityName? "｜" + communityName : "")；否则强制 name="匿名校友"；前端只显示后端返回的 name 不自己拼 | 防绕过；需求 4+6 都是硬规则 |
| D8 | 管理员新 Tab | 原 4 Tab → 扩 9 Tab：`0待审核 / 1全部档案 / 2找饭搭子 / 3公告管理 / 4密码管理 / 5创建社区审批 / 6社区管理（列表+删除） / 7加入社审批（汇总所有待审批给社长看，管理员也能直接批） / 8单聊收件箱` | 覆盖密码+社区+单聊 3 大模块 |
| D9 | 轮询刷新频率 | 进页面拉一次 + 5s 轮询（messages/announcements/students/communities/direct-messages 全统一 5s）| 体验好，GitHub API 调用配额够用（5个端点，1 小时才 5×12=60 次调用）|
| D10 | 同学身份存储位置 | **sessionStorage['cengfan.student.session']**（Q4=B：关标签页失效，刷新有效）；内容：`{studentId, verifiedAt}`；打开页面时先调 `POST /api/student-verify-session`（后端拿 studentId 再核对当前密码没变，避免密码被重置后旧会话还能用）→ 然后写内存态 studentSession | 安全：不关标签页就不用反复输密码；关了自动失效，符合 Q4 |
| D11 | 社长退出规则 | Q5=A：社长退出社前必须先转让给社区内任一成员，否则前端按钮灰+后端报错「必须先转让社长职位」| 防无主社区 |
| D12 | 社区删除规则 | 管理员 DELETE /communities/:id → 软删（status='deleted'，不在 UI 显示）同时把所有成员的 communityId 清空；同时所有 pending 状态的加入/创建申请标记为 rejected | 保留历史记录，方便追查 |
| D13 | 身份卡片 UI（Q1=B）| 同学验证成功后，在**主页顶部横幅下方**显示 1 张绿色小卡片：「✅ 已实名登录：张三｜您的密码：123456｜（若在社显示「所属社区：篮球社」）｜退出登录 按钮」 | 同学能看到自己的密码，符合 Q1=B |
| D14 | 社长面板在哪 | 同学已实名 + 当前是社长 → 在身份卡片下面显示「您是 XX 社社长」+ 1 个按钮「进入社长面板」→ 弹窗：列出本社成员、待审批加入申请列表（同意/拒绝）、转让社长下拉框 | 不用新增大页面，弹窗搞定 |

---

## 8. 疑问清单（优先级从高到低，需要你确认）

### 🔴 高优先级（影响数据模型和接口，不确认没法往下做）

| 编号 | 问题 | 我推荐的默认选项 | 选项 A / B / C |
|---|---|---|---|
| **Q1** | 同学自己能不能查看**自己的密码**？比如验证身份成功后显示「您的密码是 XXXX」？ | **A：不能**（只有管理员能看；同学忘记密码只能找管理员要，管理员从后台看/重置）| A=只管理员可见；B=同学验证成功后在「身份」卡片能看到自己的密码 |
| **Q2** | 密码是「**纯数字**（6 位手机短码，好记）」还是「**字母+数字 8 位混合**（难猜但难记）」？ | **B：8 位字母+数字（过滤易混字符）** | A=6 位纯数字；B=8 位字母数字；C=4 位汉字拼音（如「层饭2026」但易重）|
| **Q3** | 色号升级档位是否 OK？**赤红（4）+ 天蓝耀眼（5）+ 亮银（2 改）** 共 6 档？ | **A：OK** | A=OK（保持上面 6 档）；B=天蓝改为「蓝紫渐变」；C=赤红改成「中国红+金边」 |
| **Q4** | 同学身份验证成功后，**关了浏览器/刷新就失效（安全）** 还是 **记住 7 天（方便）**？ | **A：刷新失效（安全）** | A=刷新就失效；B=记住 7 天（存 sessionStorage=关标签失效+localStorage=7天）|
| **Q5** | 社长**能不能退出社区**？（退出后社区没社长 → 要指定新社长 / 管理员来指定） | **A：社长可以退出，但必须先转让社长给别人，否则不让退**（和微信/QQ 群主退群一致）| A=必须先转让才能退；B=社长直接退，社区 ownerId 空，管理员来指派 |

### 🟡 中优先级（影响 UI 细节，不影响核心流程）

| 编号 | 问题 | 推荐 |
|---|---|---|
| Q6 | 社区创建审批通过后，**创建者自动成为社长并自动成为成员**？ | A=是（推荐）|
| Q7 | 一个社区最多多少人？硬限制吗？ | A=不限制（推荐）|
| Q8 | 已被拒绝的创建/加入申请列表要不要保留展示？ | A=显示（灰掉），管理员点「清空已处理」可以批量删（推荐）|
| Q9 | 同学单聊管理员：最多存多少条？ | A=不限制，按时间倒序取前 200 条显示（推荐）|

### 🟢 低优先级（不做也能跑，锦上添花）

| 编号 | 问题 |
|---|---|
| Q10 | 要不要在同学名录头像/标签旁显示「所属社区」小徽章？（需求没说但体验好）|
| Q11 | 社区卡片要不要显示「当前社员 XX 人」？ |
| Q12 | 管理员密码管理 Tab 支持「批量导出 CSV（姓名-密码）」？ |

---

## 9. 本次任务的文件改动清单（初步）

### 9.1 新增文件（4 个）

- `docs/community-pass-upgrade/` 目录下 6 个文档（ALIGNMENT / CONSENSUS / DESIGN / TASK / ACCEPTANCE / FINAL / TODO）
- `data/communities.json`（空数组 `[]` 初始）
- `data/community-create-requests.json`（空数组）
- `data/community-join-requests.json`（空数组）
- `data/direct-messages.json`（空数组）
- `netlify/functions/student-login.js`（同学姓名+密码验证登录）
- `netlify/functions/communities.js`（社区 CRUD + 创建申请审批 + 加入申请审批 + 社长转让 + 管理员删除）
- `netlify/functions/direct-messages.js`（单聊：列表 / 发消息 / 标记已读）

### 9.2 修改文件（4 个）

- `netlify/functions/students.js`：POST/PUT 自动生成 password + 补老学生密码的「重置密码」接口（`POST /api/students/:id/reset-password`）
- `netlify/functions/messages.js`：POST 新增 `studentName + studentPassword` 校验 + 写 `verifiedReal / communityId / communityName` + 后端拼好 name 返回
- `index.html`：
  - `.student-name` CSS：升级 6 档 colorLevel（赤红4 + 天蓝耀眼5 + 亮银2调亮）
  - 新增 studentSession 内存状态
  - 新增「身份验证卡片」（放在留言板上方）
  - 主页右栏新增「社区」信息卡（和公告/留言板同级）
  - AdminPage 新增 3 个 Tab（密码管理 / 社区管理 / 单聊收件箱）
- `netlify.toml`：新增 redirects（`/api/student-login` → `/.netlify/functions/student-login`；`/api/communities/*`、`/api/direct-messages/*` 同理）

### 9.3 不改文件

- `pending.js` / `announcements.js` / `admin-login.js` 不动

---

## 10. 验收标准初稿（放入 CONSENSUS 最终化）

- [ ] 管理员在新增/编辑同学时，色号下拉有 6 档，选「赤红」→ 名录姓名框是朱红渐变；选「天蓝耀眼」→ 是亮蓝渐变带外发光；银色明显比之前更亮
- [ ] 管理员进入「密码管理 Tab」，能看到所有同学 + 对应 8 位密码；点「重置密码」生成新 8 位；已有老学生空密码会被自动批量补填提示
- [ ] 同学身份验证（姓名+密码）成功 → 留言板发言显示「姓名+（社区名）」；密码错 → 无论前端传什么 name，后端强制匿名校友，管理员能在留言板看到 verifiedReal=false 的标识（或角标）
- [ ] 同学 A 已实名 + 没社 → 申请创建「XX 社」→ 管理员审批通过 → A 是社长 + 自动加入 → A 不能再申请加入其他社
- [ ] 同学 B 实名 + 没社 → 申请加入「XX 社」→ 社长 A 在社长面板审批通过 → B 的 communityId = XX社ID
- [ ] 社长 A 点转让给 B → B 变成社长（B 本来就是社员 OK）；A 还是社员
- [ ] 管理员删除「XX 社」→ 所有成员 communityId 清空（可再加入其他）
- [ ] 同学打开手机浏览器 → 顶端公告横幅完整换行显示；三栏纵向堆叠（和之前移动端适配一致）
- [ ] 留言板上，已实名+有社区的同学发言，name 字段显示形如「李四｜篮球社」（由后端返回什么前端显示什么）
- [ ] 每个同学能在单聊入口（验证成功后显示）发消息给管理员；管理员在「单聊收件箱」Tab 能看到按同学分的会话列表，点进去能回复

---

## 11. 质量门控自检（ALIGNMENT 阶段）

| 检查项 | 是否 OK | 备注 |
|---|---|---|
| 需求边界明确（不做 P2P/不做社聊/不引入 WS）| ✅ | 显式写在 3.2 |
| 数据模型覆盖所有 6 需求 | ✅ | 6 张 JSON 全了 |
| 后端强制校验（不是只靠前端）| ✅ | 实名/一人一社/消息名字 都是后端兜底 |
| 所有不确定点都列成 Q1-Q12 问答 | ✅ | 分了高中低优先级 |
| 向后兼容老学生（已有 titleLevel 0-3 不变）| ✅ | 老数据 titleLevel 0-3 原样显示；password 为空时管理员后台有补全按钮 |
| 存储选型对齐现有架构（GitHub JSON + functions）| ✅ | 没引入新服务 |
| 移动端、色号、6 大需求都对应到验收项 | ✅ | 验收 10 项覆盖 |
