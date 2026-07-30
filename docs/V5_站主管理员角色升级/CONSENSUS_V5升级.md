# V5_站主管理员角色升级 · 共识文档（CONSENSUS_V5升级.md）

> 开发者：6A 工作流 · 阶段 1 末输出
> 最后更新：2026-07-30
> 状态：✅ 所有关键决策已确认，无遗留未决项

---

## 一、最终需求描述

### 1.1 角色体系
```
owner（站主，全站唯一）
  └─ 全局唯一：原始 owner 为王鹤澄（nickname 精确匹配，自动迁移）
  └─ 权限：所有管理员功能 + 角色管理 Tab（授/撤管理员 + 转让站主） + 删除同学 + 所有审批
  └─ 显示：档案详情弹窗标题 → 👑 金色耀眼框（自动）

admin（管理员，可多人）
  └─ 由站主授予/撤销，管理员自身无法授/撤他人管理员
  └─ 权限：除「角色管理 Tab」外的全部后台功能（审批、密码管理、删除同学等）
  └─ 显示：档案详情弹窗标题 → 🛡️ 蓝色耀眼框（adminFrame 开关，独立于头衔）

student（普通同学）
  └─ 默认角色，只能进入「用户入口」
  └─ 不能登录「管理员入口」（后端 403）
```

### 1.2 入口体系（3 类入口互不冲突）
| 入口 | 谁可以登录 | 进入后页面 |
|---|---|---|
| 👀 游客入口 | 任何人（无需密码） | MainPage（姓名仅显示 whc 式首字母，不能发言） |
| 👥 用户入口 | 所有同学（姓名+密码） | MainPage（可看真实姓名、留言、编辑本人资料） |
| 🛡️ 管理员入口 | 仅 owner/admin（姓名+密码） | AdminPage（审批、管理等） |

### 1.3 密码体系
```
默认密码：
  - 站主（王鹤澄）: 123456wHc（迁移时自动初始化）
  - 其他所有同学: 123456（迁移时自动初始化）
修改规则：
  - 登录后，每位同学（含站主）可自行修改 1 次密码
  - 修改后 passwordChangedAt = 当前时间戳（非空即禁用修改按钮）
  - 忘记密码 → 管理员/站主在后台「🔑 密码管理」Tab 重置
```

### 1.4 管理员蓝色耀眼框 vs 头衔称号
| 维度 | 🛡️ 管理员蓝色耀眼框 | 🏅 头衔称号系统 |
|---|---|---|
| 关联字段 | adminFrame (boolean) | title + titleLevel |
| 谁能设置 | 站主（角色管理 Tab） | 管理员/站主（编辑档案） |
| 授予对象 | 仅管理员（普通同学强制 false） | 任意同学 |
| 是否独立 | ✅ 完全独立（可同时存在） | ✅ 完全独立（可同时存在） |
| 视觉效果 | 蓝色渐变外框 + 流光扫光 | 姓名徽章 + 姓名填充色 |

---

## 二、技术实现方案

### 后端（Netlify Functions）
| 文件 | 接口/动作 |
|---|---|
| `students.js` GET | 自动 migrateV5Students：给所有同学加 `role/adminFrame/password/passwordChangedAt |
| `students.js POST /:id/grant-admin` | owner → 把某同学 role=admin，adminFrame=true |
| `students.js POST /:id/revoke-admin` | owner → 把某管理员 role=student，adminFrame=false |
| `students.js POST /:id/transfer-owner` | owner → 全站 owner 转给某人，原 owner 变 student |
| `students.js POST /:id/toggle-admin-frame` | owner → 切换 adminFrame（仅管理员行） |
| `students.js POST /:id/change-password` | 本人登录 → 修改自己的密码（1 次限制） |
| `student-login.js` | new param adminLogin=true 时校验 role ∈ {owner,admin}，否则 403；token 中带 role/isOwner/isAdmin |

### 前端（index.html）
- EntryPage：三入口（👥 / 🛡️ / 👀）+ 两套登录弹窗（用户/管理员）+ 备用全局超级管理员入口
- MainPage / 详情弹窗：
  - 详情标题自动金色(owner)/蓝色(adminFrame)外框
  - 「🔐 我的账户」卡：本人查看时显示修改密码入口
  - 密码修改弹窗（旧密码/新密码/确认新密码，后端限一次）
- AdminPage：
  - tabs computed：如果 amIOwner → 额外加「👑 角色管理」Tab
  - 角色管理 Tab：搜索 + 身份筛选 + 每行授/撤管理员、开关蓝色框、转让站主（站主二次确认弹窗）

---

## 三、技术约束与集成方案

- **数据一致性**：students.js GET 每次读取都会调用 migrateV5Students，老数据自动补字段（无忧升级）
- **权限闭环**：角色变更接口加 requireOwner，前端按后端校验失败回滚
- **安全**：密码仍用现有 STUDENT_TOKEN_SALT 签名 token 不变
- **兼容**：V4 已存在的所有功能不受影响，社区审批、唐榜等）

---

## 四、验收标准（可测试）
1. 王鹤澄首次登录（默认密码 `123456wHc` 成功 → 后台显示「角色管理」Tab
2. 普通同学尝试管理员入口登录 → 403 报错，不能进后台
3. 站主给 A 同学管理员 → A 可通过管理员入口进入后台，但看不到角色管理 Tab
4. 管理员 B 同学管理员 → B 尝试访问 grant-admin 接口 → 后端 401/403
5. 站主转让给 C → 同学 → 原站主变成 student，看不到角色管理 Tab；C 看到
6. 任意同学修改密码成功 → 再点修改提示已修改，刷新后修改一次限制真的生效（后端也拦截第二次）
7. 管理员 D adminFrame=false → 档案详情仍显示管理员，但看不到蓝色耀眼框，但管理员身份正常后台
8. 设置头衔为「文艺委员」+ 开启 adminFrame 的同学 → 两个效果同显示（独立并存）

---

## 五、任务边界与限制

- 全站仅 1 位 owner，不支持多人 owner
- 密码修改仅 1 次，不支持多次修改（忘记找站主）
- 不做操作审计日志
- 不做真实姓名脱敏增强（沿用 V4 已有的 displayNameOf 首字母方案）
