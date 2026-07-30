const https = require('https');
const crypto = require('crypto');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data/students.json';
const COMMUNITY_FILE_PATH = 'data/communities.json';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';
const STUDENT_SALT = process.env.STUDENT_TOKEN_SALT || 'cengfan-student-salt-2024';

// ============ V5 升级 常量 ============
const V5_DEFAULT_STUDENT_PASSWORD = '123456';         // 其他同学默认密码
const V5_OWNER_DEFAULT_PASSWORD = '123456wHc';        // 站主（王鹤澄）默认密码
const V5_ORIGINAL_OWNER_NAME = '王鹤澄';               // 原始站主姓名
const VALID_ROLES = ['owner', 'admin', 'student'];

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
// 解析 X-Student-Token（与 student-login.js / messages.js 一致）
const parseStudentToken = (token, students) => {
  if (!token || typeof token !== 'string' || !students) return null;
  const [b64, sign] = token.split('.');
  if (!b64 || !sign) return null;
  let payload = null;
  try { payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); }
  catch (e) { return null; }
  if (!payload || !payload.id || !payload.createdAt) return null;
  if (md5(JSON.stringify(payload) + STUDENT_SALT) !== sign) return null;
  if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
  const s = students.find(x => String(x.id) === String(payload.id));
  if (!s) return null;
  if (String(s.password || '').slice(-4) !== (payload.passTail || '')) return null;
  return s;
};

// 东八区时间格式化（不管服务器时区，强制 Asia/Shanghai）
const toBeijingTime = (date = new Date()) => {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(date).replace(/\//g, '-');
};

console.log('[students-github] ENV check:');
console.log('  GITHUB_TOKEN:', GITHUB_TOKEN ? 'SET (' + GITHUB_TOKEN.substring(0, 8) + '...)' : 'MISSING');
console.log('  GITHUB_REPO:', GITHUB_REPO || 'MISSING');
console.log('  FILE_PATH:', FILE_PATH);

// 全局 ADMIN_TOKEN 校验（部署时保留的旧全局管理员，仅兜底）
const verifyGlobalAdminToken = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
};

// 解析同学 token 并同时校验其权限等级
// 返回 { student, role: 'owner'|'admin'|'student'|null, isGlobalAdmin: boolean }
const authStudentContext = (event, students) => {
  const headerToken = event.headers['x-student-token'] || event.headers['X-Student-Token'];
  const fromToken = headerToken ? parseStudentToken(String(headerToken), students) : null;
  const isGlobal = verifyGlobalAdminToken(event);
  if (!fromToken) {
    return { student: null, role: null, isGlobalAdmin: isGlobal };
  }
  const role = VALID_ROLES.includes(fromToken.role) ? fromToken.role : 'student';
  return { student: fromToken, role, isGlobalAdmin: isGlobal };
};

// 必须是 OWNER 或 全局管理员（才能做：授/撤管理员、转让站主）
const requireOwner = (ctx) => ctx.role === 'owner' || ctx.isGlobalAdmin;
// 必须是 OWNER / ADMIN / 全局管理员（才能进入后台）
const requireOwnerOrAdmin = (ctx) => ctx.role === 'owner' || ctx.role === 'admin' || ctx.isGlobalAdmin;

const githubRequest = (method, repo, path, body = null) => {
  return new Promise((resolve, reject) => {
    const urlPath = `/repos/${repo}/contents/${path}`;
    console.log(`[github] ${method} https://api.github.com${urlPath}`);
    const options = {
      hostname: 'api.github.com',
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'cengfan-netlify-function',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`[github] Response status: ${res.statusCode}, body length: ${data.length}`);
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw: data.substring(0, 500) });
        }
      });
    });

    req.on('error', (e) => {
      console.error('[github] Network error:', e.message);
      reject(e);
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

const getFileContent = async () => {
  const res = await githubRequest('GET', GITHUB_REPO, FILE_PATH);
  if (res.status === 200 && res.data && res.data.content) {
    const jsonStr = Buffer.from(res.data.content, 'base64').toString('utf-8');
    console.log('[getFile] Parsed JSON length:', jsonStr.length);
    return { list: JSON.parse(jsonStr), sha: res.data.sha };
  }
  console.error('[getFile] Failed:', res.status, JSON.stringify(res.data || res.raw));
  throw new Error(`Failed to read file: status ${res.status}`);
};

const writeFileContent = async (list, sha, messageSuffix = '') => {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
  const body = {
    message: `Update students.json${messageSuffix ? ' — ' + messageSuffix : ''} at ${new Date().toISOString()}`,
    content: content,
    sha: sha,
    branch: GITHUB_BRANCH
  };
  const res = await githubRequest('PUT', GITHUB_REPO, FILE_PATH, body);
  if (res.status === 200 || res.status === 201) {
    console.log('[writeFile] Success');
    return;
  }
  console.error('[writeFile] FAILED:', res.status, JSON.stringify(res.data || res.raw));
  throw new Error(`Failed to write file: status ${res.status}`);
};

// ============ 社区 JSON 读写（与上面一致，单独路径）============
const getCommunityFile = async () => {
  const res = await githubRequest('GET', GITHUB_REPO, COMMUNITY_FILE_PATH);
  if (res.status === 200 && res.data && res.data.content) {
    const jsonStr = Buffer.from(res.data.content, 'base64').toString('utf-8');
    return { list: JSON.parse(jsonStr), sha: res.data.sha };
  }
  throw new Error(`Failed to read community file: status ${res.status}`);
};
const writeCommunityFile = async (list, sha) => {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
  const body = {
    message: `Update communities.json at ${new Date().toISOString()}`,
    content: content,
    sha: sha,
    branch: GITHUB_BRANCH
  };
  const res = await githubRequest('PUT', GITHUB_REPO, COMMUNITY_FILE_PATH, body);
  if (res.status === 200 || res.status === 201) return;
  throw new Error(`Failed to write community file: status ${res.status}`);
};

// ============ 密码生成（6位纯数字，连续重复>3位重生成）============
const hasTooManyRepeats = (str) => {
  let count = 1;
  for (let i = 1; i < str.length; i++) {
    if (str[i] === str[i - 1]) { count++; if (count > 3) return true; }
    else count = 1;
  }
  return false;
};
const random6Digits = () => {
  for (let tries = 0; tries < 20; tries++) {
    let s = '';
    for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 10);
    if (!hasTooManyRepeats(s)) return s;
  }
  return String(Date.now()).slice(-6);
};
const generateUniquePassword = (existingList, length = 6) => {
  const used = new Set(existingList.map(s => s.password).filter(Boolean));
  for (let i = 0; i < 500; i++) {
    const candidate = length === 7
      ? String(Date.now() + i).slice(-7)
      : random6Digits();
    if (!used.has(candidate)) return candidate;
  }
  if (length === 6) return generateUniquePassword(existingList, 7);
  return String(Date.now() + Math.floor(Math.random() * 1000)).slice(-7);
};

// ============ V5 数据迁移：角色 / adminFrame / passwordChangedAt / 默认密码 ============
// 返回 { list, changed }
const migrateV5Students = (list) => {
  if (!Array.isArray(list)) return { list: [], changed: false };
  let changed = false;
  // 1) 先确保每个同学都有基础字段
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s || typeof s !== 'object') continue;
    // role：默认 student
    if (!VALID_ROLES.includes(s.role)) {
      s.role = 'student'; changed = true;
    }
    // adminFrame：管理员独有的蓝色耀眼框（独立于头衔），默认 false
    if (typeof s.adminFrame !== 'boolean') {
      s.adminFrame = false; changed = true;
    }
    // passwordChangedAt：null 表示还没改过密码（允许改 1 次）
    if (s.passwordChangedAt !== undefined && s.passwordChangedAt !== null
        && typeof s.passwordChangedAt !== 'string') {
      s.passwordChangedAt = null; changed = true;
    }
    if (s.passwordChangedAt === undefined) {
      s.passwordChangedAt = null; changed = true;
    }
    // password 强转 string
    if (typeof s.password !== 'string') {
      s.password = s.password != null ? String(s.password) : '';
      changed = true;
    }
  }
  // 2) 找到原始站主「王鹤澄」→ 设置为 owner（且全站唯一 owner）
  let ownerIdx = list.findIndex(s => s.role === 'owner');
  const wangIdx = list.findIndex(s =>
    (s.nickname || '').trim() === V5_ORIGINAL_OWNER_NAME
  );
  if (ownerIdx === -1) {
    // 没有 owner：把王鹤澄设为 owner（如果找不到王鹤澄，就留空，等后续管理员手动转）
    if (wangIdx !== -1) {
      list[wangIdx].role = 'owner';
      list[wangIdx].adminFrame = true;
      changed = true;
    }
  } else if (ownerIdx !== wangIdx && wangIdx !== -1) {
    // 已有 owner，但他不是王鹤澄：保持唯一性不变（不强制抢回），仅打印
    console.log('[migrateV5] existing owner is not 王鹤澄, keep as-is. ownerIdx=', ownerIdx, 'wangIdx=', wangIdx);
  }
  // 3) 再次确保全站只有 1 个 owner（兜底：有多个时，保留第一个匹配到的，其余降为 admin）
  let seenOwner = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].role === 'owner') {
      if (!seenOwner) { seenOwner = true; list[i].adminFrame = true; continue; }
      list[i].role = 'admin'; // 多余的 owner → admin
      list[i].adminFrame = true;
      changed = true;
    }
  }
  // 4) 所有 admin 默认有蓝色框；普通同学随 adminFrame 字段
  for (let i = 0; i < list.length; i++) {
    if (list[i].role === 'owner' || list[i].role === 'admin') {
      if (list[i].adminFrame !== true) { list[i].adminFrame = true; changed = true; }
    }
  }
  // 5) 默认密码：owner=123456wHc，其他=123456（V5 强制重置，以便同学首次登录后自行修改 1 次）
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.role === 'owner') {
      const want = V5_OWNER_DEFAULT_PASSWORD;
      if (String(s.password || '').trim() !== want) {
        s.password = want;
        s.passwordChangedAt = null; // 系统重置 → 允许用户自己再改一次
        changed = true;
      }
    } else {
      const want = V5_DEFAULT_STUDENT_PASSWORD;
      if (String(s.password || '').trim() !== want) {
        s.password = want;
        s.passwordChangedAt = null;
        changed = true;
      }
    }
  }
  return { list, changed };
};

// 带自动迁移的读文件（任何写操作之前都用这个，确保数据是 V5 新结构再写）
const getAndMigrateFile = async () => {
  const raw = await getFileContent();
  const { list, changed } = migrateV5Students(raw.list);
  if (changed) {
    await writeFileContent(list, raw.sha, `V5 migrate: role/adminFrame/passwordChangedAt/defaultPassword`);
    // 重新取一次拿最新 sha（实际上 GitHub 会更新 content sha，但我们刚刚写成功就沿用也 OK；为严谨直接重读）
    const after = await getFileContent();
    return { list: after.list, sha: after.sha, migrated: true };
  }
  return { list, sha: raw.sha, migrated: false };
};

// ============ 同学端鉴权：通过姓名+密码查 student ============
const verifyStudentByName = (list, name, password) => {
  if (!name || !password) return null;
  const cleanName = String(name).trim();
  const cleanPass = String(password).trim();
  for (const s of list) {
    if (s.nickname && s.nickname.trim() === cleanName && String(s.password || '') === cleanPass) return s;
  }
  return null;
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-Student-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GitHub not configured', token: !!GITHUB_TOKEN, repo: !!GITHUB_REPO })
      };
    }

    // ====== GET：带 V5 自动迁移；返回脱敏列表 ======
    if (event.httpMethod === 'GET') {
      const { list } = await getAndMigrateFile();
      const ctx = authStudentContext(event, list);
      const canSeePwd = requireOwnerOrAdmin(ctx) || ctx.isGlobalAdmin;
      const safeList = list.map(s => {
        const copy = { ...s };
        if (!canSeePwd) {
          const p = String(copy.password || '');
          if (p.length >= 4) copy.password = '****' + p.slice(-2);
          else if (p.length > 0) copy.password = '****';
          else copy.password = '';
        }
        return copy;
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          data: safeList,
          // 给当前登录同学返回个人权限
          me: ctx.student ? {
            id: ctx.student.id,
            nickname: ctx.student.nickname,
            role: ctx.role,
            adminFrame: !!ctx.student.adminFrame
          } : null,
          isGlobalAdmin: ctx.isGlobalAdmin
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const path = event.path || '';
      // ====== R1：POST /api/students/batch-fill-passwords（管理员批量补空密码，V5 下很少用，但保留）======
      if (path.endsWith('/batch-fill-passwords')) {
        const { list, sha } = await getAndMigrateFile();
        const ctx = authStudentContext(event, list);
        if (!requireOwnerOrAdmin(ctx) && !ctx.isGlobalAdmin) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: '仅管理员可批量补密码' }) };
        }
        // 这里不重新覆盖默认密码（因为 V5 迁移已经设过），仅填空的（极端情况兜底）
        let filled = 0;
        for (const s of list) {
          if (!s.password || String(s.password).trim() === '') {
            s.password = s.role === 'owner' ? V5_OWNER_DEFAULT_PASSWORD : V5_DEFAULT_STUDENT_PASSWORD;
            filled++;
          }
        }
        if (filled > 0) await writeFileContent(list, sha, `batch-fill ${filled} passwords`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, filledCount: filled, total: list.length })
        };
      }

      // ====== R2：POST /api/students/:id/reset-password（管理员重置单个密码 → 重置后 passwordChangedAt=null，允许同学再改 1 次）======
      if (/\/reset-password$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        const { list, sha } = await getAndMigrateFile();
        const ctx = authStudentContext(event, list);
        if (!requireOwnerOrAdmin(ctx) && !ctx.isGlobalAdmin) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: '仅管理员可重置密码' }) };
        }
        const idx = list.findIndex(s => String(s.id) === String(id));
        if (idx === -1) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: '同学档案不存在' }) };
        }
        // owner/admin 重置：给默认密码
        const newPass = list[idx].role === 'owner' ? V5_OWNER_DEFAULT_PASSWORD : V5_DEFAULT_STUDENT_PASSWORD;
        list[idx].password = newPass;
        list[idx].passwordChangedAt = null; // 允许再改一次
        await writeFileContent(list, sha, `reset pwd for student ${id}`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, id: list[idx].id, nickname: list[idx].nickname, newPassword: newPass })
        };
      }

      // ====== R3：POST /api/students/:id/leave-community（同学自己退社；社长退社自动转让给下一位）======
      if (/\/leave-community$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
        const { list, sha } = await getAndMigrateFile();
        const ctx = authStudentContext(event, list);
        const targetIdx = list.findIndex(s => String(s.id) === String(id));
        if (targetIdx === -1) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: '同学档案不存在' }) };
        }
        const targetStudent = list[targetIdx];
        const inputPassword = String(body.studentPassword || body.password || '').trim();
        const tokenMatched = ctx.student && String(ctx.student.id) === String(id);
        const passwordMatched = inputPassword && String(targetStudent.password || '') === inputPassword;
        if (!tokenMatched || !passwordMatched) {
          return { statusCode: 401, headers, body: JSON.stringify({
            error: '退社失败：请重新登录同学身份，并确保输入的密码正确（退社需密码二次确认）'
          }) };
        }
        const me = targetStudent;
        if (!me.communityId) {
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: '当前未加入任何社区', communityId: null }) };
        }
        const { list: communities, sha: csha } = await getCommunityFile();
        const cidx = communities.findIndex(c => String(c.id) === String(me.communityId));
        if (cidx === -1) {
          const sIdx = list.findIndex(s => String(s.id) === String(me.id));
          list[sIdx].communityId = null;
          list[sIdx].communityName = '';
          await writeFileContent(list, sha, `leave community (deleted)`);
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: '社区已删除，已退出', communityId: null }) };
        }
        const community = communities[cidx];
        community.memberIds = (community.memberIds || []).filter(mid => String(mid) !== String(me.id));
        let autoTransferred = null;
        if (String(community.ownerId) === String(me.id)) {
          if (community.memberIds.length > 0) {
            const newOwnerId = community.memberIds[0];
            community.ownerId = newOwnerId;
            autoTransferred = list.find(s => String(s.id) === String(newOwnerId));
          } else {
            community.ownerId = null;
            community.status = community.status || 'ownerless';
          }
        }
        communities[cidx] = community;
        await writeCommunityFile(communities, csha);
        const sIdx = list.findIndex(s => String(s.id) === String(me.id));
        list[sIdx].communityId = null;
        list[sIdx].communityName = '';
        await writeFileContent(list, sha, `leave community ${me.communityId}`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            message: autoTransferred
              ? ('退出成功，社长自动转让给 ' + (autoTransferred.nickname || autoTransferred.id))
              : '退出成功',
            communityId: null,
            transferredOwnerTo: autoTransferred ? { id: autoTransferred.id, nickname: autoTransferred.nickname } : null
          })
        };
      }

      // ====== R4：POST /api/students/:id/change-password（同学自己改密码，只能改 1 次）======
      if (/\/change-password$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
        const { list, sha } = await getAndMigrateFile();
        const ctx = authStudentContext(event, list);
        // 必须登录本人
        if (!ctx.student || String(ctx.student.id) !== String(id)) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: '请先以本人身份登录后再修改密码' }) };
        }
        const idx = list.findIndex(s => String(s.id) === String(id));
        if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '档案不存在' }) };
        const me = list[idx];
        // 只能改 1 次
        if (me.passwordChangedAt) {
          return { statusCode: 400, headers, body: JSON.stringify({
            error: `您已于 ${me.passwordChangedAt} 修改过一次密码，每人仅限修改 1 次。若需重置请联系管理员。`
          }) };
        }
        const oldPass = String(body.oldPassword || '').trim();
        const newPass = String(body.newPassword || '').trim();
        if (!oldPass || !newPass) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '请填写原密码和新密码' }) };
        }
        if (String(me.password || '') !== oldPass) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: '原密码不正确' }) };
        }
        if (newPass.length < 6) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '新密码至少 6 位' }) };
        }
        if (newPass.length > 32) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '新密码过长（最多 32 位）' }) };
        }
        if (newPass === oldPass) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '新密码不能与原密码相同' }) };
        }
        me.password = newPass;
        me.passwordChangedAt = toBeijingTime();
        await writeFileContent(list, sha, `student ${id} changed password`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            passwordChangedAt: me.passwordChangedAt,
            message: '密码修改成功！请妥善保管（每人仅限改 1 次）'
          })
        };
      }

      // ====== R5：POST /api/students/:id/grant-admin（站主 → 授予管理员权限 + 自动开蓝色框）======
      if (/\/grant-admin$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        const { list, sha } = await getAndMigrateFile();
        const ctx = authStudentContext(event, list);
        if (!requireOwner(ctx)) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: '仅站主可授予管理员权限' }) };
        }
        const idx = list.findIndex(s => String(s.id) === String(id));
        if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '同学档案不存在' }) };
        if (list[idx].role === 'owner') {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '对方已是站主，无需再授管理员' }) };
        }
        list[idx].role = 'admin';
        list[idx].adminFrame = true;
        await writeFileContent(list, sha, `grant admin to ${id}`);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, student: list[idx] }) };
      }

      // ====== R6：POST /api/students/:id/revoke-admin（站主 → 撤销管理员，保留蓝色框/头衔互不影响，这里我们把 adminFrame 也关掉，因为用户说蓝色为管理员独有）======
      if (/\/revoke-admin$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        const { list, sha } = await getAndMigrateFile();
        const ctx = authStudentContext(event, list);
        if (!requireOwner(ctx)) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: '仅站主可撤销管理员权限' }) };
        }
        const idx = list.findIndex(s => String(s.id) === String(id));
        if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '同学档案不存在' }) };
        if (list[idx].role === 'owner') {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '无法撤销站主的管理员身份（如需转让请点“转让站主”）' }) };
        }
        if (list[idx].role !== 'admin') {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '对方不是管理员，无需撤销' }) };
        }
        list[idx].role = 'student';
        list[idx].adminFrame = false; // 管理员独有蓝色框同步撤销
        await writeFileContent(list, sha, `revoke admin from ${id}`);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, student: list[idx] }) };
      }

      // ====== R7：POST /api/students/:id/transfer-owner（站主 → 转让站主身份给某同学）======
      if (/\/transfer-owner$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        const { list, sha } = await getAndMigrateFile();
        const ctx = authStudentContext(event, list);
        if (!requireOwner(ctx)) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: '仅站主可转让站主身份' }) };
        }
        const idx = list.findIndex(s => String(s.id) === String(id));
        if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '目标同学档案不存在' }) };
        if (!ctx.student) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: '请登录后再转让站主' }) };
        }
        const myIdx = list.findIndex(s => String(s.id) === String(ctx.student.id));
        if (myIdx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '原站主档案异常' }) };
        if (String(list[myIdx].id) === String(list[idx].id)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '无法转让给你自己' }) };
        }
        // 二次密码确认（站主身份是敏感操作）
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
        const inputPwd = String(body.ownerPassword || '').trim();
        if (!inputPwd || String(list[myIdx].password || '') !== inputPwd) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: '转让站主需输入当前站主的密码二次确认' }) };
        }
        const newOwner = list[idx];
        const oldOwner = list[myIdx];
        // 新 owner → role=owner + 开蓝色框
        newOwner.role = 'owner';
        newOwner.adminFrame = true;
        // 旧 owner → role=student，蓝色框关闭（头衔 title/titleLevel 保留独立不变）
        oldOwner.role = 'student';
        oldOwner.adminFrame = false;
        await writeFileContent(list, sha, `transfer owner from ${oldOwner.id} to ${newOwner.id}`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            newOwner: { id: newOwner.id, nickname: newOwner.nickname, role: newOwner.role },
            oldOwner: { id: oldOwner.id, nickname: oldOwner.nickname, role: oldOwner.role }
          })
        };
      }

      // ====== 默认 POST：新增档案（仅 owner/admin/全局管理员）======
      const { list: listForAdd, sha: shaForAdd } = await getAndMigrateFile();
      const ctxAdd = authStudentContext(event, listForAdd);
      if (!requireOwnerOrAdmin(ctxAdd) && !ctxAdd.isGlobalAdmin) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: '仅管理员可新增同学档案' }) };
      }
      let bodyAdd = {};
      try { bodyAdd = JSON.parse(event.body || '{}'); } catch (e) { bodyAdd = {}; }
      console.log('[POST] New student:', bodyAdd.nickname, bodyAdd.province);
      // 默认给 V5 密码
      const newPassword = (bodyAdd.password && String(bodyAdd.password).trim())
        ? String(bodyAdd.password).trim()
        : V5_DEFAULT_STUDENT_PASSWORD;
      // 新增同学：默认 role=student，adminFrame=false（不通过新增来直接给 admin，必须走 grant-admin 接口由站主授）
      const newItem = {
        id: Date.now(),
        created_at: toBeijingTime(),
        ...bodyAdd,
        hobbies: bodyAdd.hobbies || [],
        looking_for_food: bodyAdd.looking_for_food || false,
        wechat: bodyAdd.wechat || '',
        qq: bodyAdd.qq || '',
        title: bodyAdd.title || '',
        titleLevel: (bodyAdd.titleLevel !== undefined && bodyAdd.titleLevel !== null)
          ? (parseInt(bodyAdd.titleLevel) || 0)
          : 0,
        role: 'student',
        adminFrame: false,
        passwordChangedAt: null,
        password: newPassword,
        communityId: bodyAdd.communityId || null,
        communityName: bodyAdd.communityName || ''
      };
      listForAdd.push(newItem);
      await writeFileContent(listForAdd, shaForAdd, `add student ${newItem.id}`);
      return { statusCode: 200, headers, body: JSON.stringify(newItem) };
    }

    // ====== PUT：编辑档案（管理员可改大部分；站主额外可改 role/adminFrame）======
    if (event.httpMethod === 'PUT') {
      const id = event.path.split('/').pop();
      const { list, sha } = await getAndMigrateFile();
      const ctx = authStudentContext(event, list);
      if (!requireOwnerOrAdmin(ctx) && !ctx.isGlobalAdmin) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: '仅管理员可编辑同学档案' }) };
      }
      const idx = list.findIndex(s => String(s.id) === String(id));
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: '同学档案不存在' }) };
      }
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
      console.log('[PUT] id:', id);
      const oldItem = list[idx];

      const newHobbies = (body.hobbies !== undefined && body.hobbies !== null)
        ? body.hobbies : (oldItem.hobbies || []);
      const newLooking = (body.looking_for_food !== undefined && body.looking_for_food !== null)
        ? body.looking_for_food : (oldItem.looking_for_food || false);
      const newWechat = (body.wechat !== undefined && body.wechat !== null)
        ? body.wechat : (oldItem.wechat || '');
      const newQQ = (body.qq !== undefined && body.qq !== null)
        ? body.qq : (oldItem.qq || '');
      const newTitle = (body.title !== undefined && body.title !== null)
        ? body.title : (oldItem.title || '');
      const newTitleLevel = (body.titleLevel !== undefined && body.titleLevel !== null)
        ? (parseInt(body.titleLevel) || 0)
        : (parseInt(oldItem.titleLevel) || 0);
      // 密码：管理员可以通过 PUT 改，但改完之后 passwordChangedAt 要清（让用户能自己改一次）
      let newPassword = oldItem.password || V5_DEFAULT_STUDENT_PASSWORD;
      let pwdChangedInPut = false;
      if (body.password !== undefined && body.password !== null && String(body.password).trim() !== '') {
        newPassword = String(body.password).trim();
        pwdChangedInPut = true;
      }
      const newCommunityId = (body.communityId !== undefined && body.communityId !== null)
        ? body.communityId : (oldItem.communityId || null);
      const newCommunityName = (body.communityName !== undefined && body.communityName !== null)
        ? body.communityName : (oldItem.communityName || '');

      // ========== V5 关键：role/adminFrame 只有站主能改！============
      let finalRole = oldItem.role;
      let finalAdminFrame = oldItem.adminFrame;
      let finalPasswordChangedAt = oldItem.passwordChangedAt;
      if (requireOwner(ctx) || ctx.isGlobalAdmin) {
        // 站主/全局管理员：可改 role
        if (body.role && VALID_ROLES.includes(body.role)) {
          // 但仍需保证全站唯一 owner：如果把某个同学设为 owner，原来的 owner → admin
          if (body.role === 'owner') {
            for (let i = 0; i < list.length; i++) {
              if (i !== idx && list[i].role === 'owner') {
                list[i].role = 'admin';
                list[i].adminFrame = true;
              }
            }
          }
          finalRole = body.role;
        }
        // adminFrame：站主可以单独开/关（但 owner/admin 默认 true；如果用户主动传 false 就关掉）
        if (typeof body.adminFrame === 'boolean') {
          finalAdminFrame = body.adminFrame;
        } else if (finalRole === 'owner' || finalRole === 'admin') {
          finalAdminFrame = true;
        }
      } else {
        // 普通管理员：改 role / adminFrame 直接驳回
        if (body.role && body.role !== oldItem.role) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: '仅站主可修改角色（授/撤管理员、转让站主）' }) };
        }
        if (typeof body.adminFrame === 'boolean' && body.adminFrame !== oldItem.adminFrame) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: '仅站主可开关管理员蓝色框' }) };
        }
      }
      // 如果管理员在 PUT 时动了密码，就允许用户再改 1 次
      if (pwdChangedInPut) finalPasswordChangedAt = null;

      const merged = {
        ...oldItem,
        ...body,
        id: oldItem.id,
        created_at: oldItem.created_at || toBeijingTime(),
        hobbies: newHobbies,
        looking_for_food: newLooking,
        wechat: newWechat,
        qq: newQQ,
        title: newTitle,
        titleLevel: newTitleLevel,
        password: newPassword,
        passwordChangedAt: finalPasswordChangedAt,
        role: finalRole,
        adminFrame: finalAdminFrame,
        communityId: newCommunityId,
        communityName: newCommunityName
      };
      list[idx] = merged;
      await writeFileContent(list, sha, `update student ${id}`);
      return { statusCode: 200, headers, body: JSON.stringify(list[idx]) };
    }

    // ====== DELETE：删除档案（仅站主/全局管理员可做；普通管理员不允许删人，避免误操作）======
    if (event.httpMethod === 'DELETE') {
      const id = event.path.split('/').pop();
      console.log('[DELETE] id:', id);
      const { list, sha } = await getAndMigrateFile();
      const ctx = authStudentContext(event, list);
      if (!requireOwner(ctx) && !ctx.isGlobalAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: '仅站主可删除同学档案（管理员如需删除请联系站主）' }) };
      }
      const idx = list.findIndex(s => String(s.id) === String(id));
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: '同学档案不存在' }) };
      }
      if (list[idx].role === 'owner') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '不能删除站主（请先转让站主身份）' }) };
      }
      list.splice(idx, 1);
      await writeFileContent(list, sha, `delete student ${id}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('[students] FATAL:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
