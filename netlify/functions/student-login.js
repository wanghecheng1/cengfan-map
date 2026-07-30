const https = require('https');
const crypto = require('crypto');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data/students.json';
const STUDENT_SALT = process.env.STUDENT_TOKEN_SALT || 'cengfan-student-salt-2024';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 2;

// ============ V5 升级 常量（与 students.js 保持一致）============
const V5_DEFAULT_STUDENT_PASSWORD = '123456';
const V5_OWNER_DEFAULT_PASSWORD = '123456wHc';
const V5_ORIGINAL_OWNER_NAME = '王鹤澄';
const VALID_ROLES = ['owner', 'admin', 'student'];

const toBeijingTime = (date = new Date()) => {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(date).replace(/\//g, '-');
};

const githubRequest = (method, repo, path, body = null) => {
  return new Promise((resolve, reject) => {
    const urlPath = `/repos/${repo}/contents/${path}`;
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
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: null, raw: data.substring(0, 500) }); }
      });
    });
    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

const writeStudentsBack = async (list, sha, messageSuffix = '') => {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
  const body = {
    message: `Update students.json${messageSuffix ? ' — ' + messageSuffix : ''} at ${new Date().toISOString()}`,
    content, sha, branch: GITHUB_BRANCH
  };
  const res = await githubRequest('PUT', GITHUB_REPO, FILE_PATH, body);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Failed to write students back: status ${res.status}`);
  }
};

// ============ V5 迁移（与 students.js 一致，确保任何接口首次访问都迁移）============
const migrateV5Students = (list) => {
  if (!Array.isArray(list)) return { list: [], changed: false };
  let changed = false;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s || typeof s !== 'object') continue;
    if (!VALID_ROLES.includes(s.role)) { s.role = 'student'; changed = true; }
    if (typeof s.adminFrame !== 'boolean') { s.adminFrame = false; changed = true; }
    if (s.passwordChangedAt !== undefined && s.passwordChangedAt !== null
        && typeof s.passwordChangedAt !== 'string') {
      s.passwordChangedAt = null; changed = true;
    }
    if (s.passwordChangedAt === undefined) { s.passwordChangedAt = null; changed = true; }
    if (typeof s.password !== 'string') {
      s.password = s.password != null ? String(s.password) : ''; changed = true;
    }
  }
  let ownerIdx = list.findIndex(s => s.role === 'owner');
  const wangIdx = list.findIndex(s => (s.nickname || '').trim() === V5_ORIGINAL_OWNER_NAME);
  if (ownerIdx === -1 && wangIdx !== -1) {
    list[wangIdx].role = 'owner';
    list[wangIdx].adminFrame = true;
    changed = true;
  }
  let seenOwner = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].role === 'owner') {
      if (!seenOwner) { seenOwner = true; list[i].adminFrame = true; continue; }
      list[i].role = 'admin';
      list[i].adminFrame = true;
      changed = true;
    }
  }
  for (let i = 0; i < list.length; i++) {
    if (list[i].role === 'owner' || list[i].role === 'admin') {
      if (list[i].adminFrame !== true) { list[i].adminFrame = true; changed = true; }
    }
  }
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.role === 'owner') {
      const want = V5_OWNER_DEFAULT_PASSWORD;
      if (String(s.password || '').trim() !== want) {
        s.password = want; s.passwordChangedAt = null; changed = true;
      }
    } else {
      const want = V5_DEFAULT_STUDENT_PASSWORD;
      if (String(s.password || '').trim() !== want) {
        s.password = want; s.passwordChangedAt = null; changed = true;
      }
    }
  }
  return { list, changed };
};

const getStudentsAndMigrate = async () => {
  const res = await githubRequest('GET', GITHUB_REPO, FILE_PATH);
  if (!(res.status === 200 && res.data && res.data.content)) {
    throw new Error(`Failed to read students: status ${res.status}`);
  }
  const sha = res.data.sha;
  const jsonStr = Buffer.from(res.data.content, 'base64').toString('utf-8');
  const raw = JSON.parse(jsonStr);
  const { list, changed } = migrateV5Students(raw);
  if (changed) {
    await writeStudentsBack(list, sha, `V5 migrate from student-login: role/adminFrame/passwordChangedAt/defaultPassword`);
    return list;
  }
  return list;
};

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

const signToken = (student) => {
  const payload = {
    id: student.id,
    nickname: student.nickname,
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
    passTail: String(student.password || '').slice(-4)
  };
  const json = JSON.stringify(payload);
  const signature = md5(json + STUDENT_SALT);
  return Buffer.from(json).toString('base64') + '.' + signature;
};

const parseToken = (token, list) => {
  if (!token || typeof token !== 'string') return null;
  const [b64, sign] = token.split('.');
  if (!b64 || !sign) return null;
  let payload = null;
  try { payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')); }
  catch (e) { return null; }
  if (!payload || !payload.id || !payload.createdAt) return null;
  const recomputed = md5(JSON.stringify(payload) + STUDENT_SALT);
  if (recomputed !== sign) return null;
  if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
  const student = list.find(s => String(s.id) === String(payload.id));
  if (!student) return null;
  const curTail = String(student.password || '').slice(-4);
  if (payload.passTail !== curTail) return null;
  return student;
};

// V5: 给前端返回角色/管理权限相关字段
const sanitizeStudent = (s) => {
  const role = VALID_ROLES.includes(s.role) ? s.role : 'student';
  return {
    id: s.id,
    nickname: s.nickname,
    title: s.title || '',
    titleLevel: s.titleLevel || 0,
    adminFrame: !!s.adminFrame,   // 管理员独有的蓝色框（独立于头衔）
    role,                          // 'owner' | 'admin' | 'student'
    passwordChangedAt: s.passwordChangedAt || null, // 已改 1 次则非空
    communityId: s.communityId || null,
    communityName: s.communityName || '',
    province: s.province || '',
    grade: s.grade || '',
    hobbies: s.hobbies || [],
    looking_for_food: !!s.looking_for_food,
    wechat: s.wechat || '',
    qq: s.qq || '',
    avatar: s.avatar || '',
    created_at: s.created_at || ''
  };
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-Student-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'GitHub not configured' }) };
    }

    const path = event.path || '';
    const list = await getStudentsAndMigrate();

    // ==== S2：POST /api/student-login/me  校验会话（V5 返回角色）====
    if (path.endsWith('/me') || path.endsWith('/verify') || event.httpMethod === 'GET') {
      let token = null;
      if (event.httpMethod === 'POST') {
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
        token = body.token || body.studentToken;
      } else {
        const qs = (event.queryStringParameters || {});
        token = qs.token || (event.headers['x-student-token'] || event.headers['X-Student-Token']);
      }
      const student = parseToken(token, list);
      if (!student) {
        return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: '会话已过期，请重新登录' }) };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, student: sanitizeStudent(student) })
      };
    }

    // ==== S1：POST /api/student-login  姓名+密码登录（V5：支持管理员入口登录单独校验）====
    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
      const name = String(body.studentName || body.name || '').trim();
      const password = String(body.studentPassword || body.password || '').trim();
      const isAdminLogin = !!body.adminLogin;   // true=管理员入口登录，必须是 owner/admin
      if (!name || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: '⚠️ 姓名和密码两项都必须填写，缺一不可！' }) };
      }
      if (name.length < 2) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: '请填写完整姓名（至少 2 个字符，需与档案一致）' }) };
      }
      if (password.length < 4) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: '密码长度过短，请输入管理员分配的完整 6 位登录密码' }) };
      }
      const matched = list.filter(s => (s.nickname || '').trim() === name);
      if (matched.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: `档案中未找到姓名为「${name}」的同学，请核对后重试（注意是否有错别字/空格）` }) };
      }
      let loginStudent = null;
      for (const s of matched) {
        if (String(s.password || '').trim() === password) { loginStudent = s; break; }
      }
      if (!loginStudent) {
        return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: matched.length > 1 ? '密码错误（档案中存在同名同学，请联系管理员核对密码）' : `「${name}」的密码错误，请确认是否为管理员分配的最新 6 位密码` }) };
      }
      // =========== V5 关键：管理员入口校验角色（普通同学无法从管理员入口登录）===========
      if (isAdminLogin) {
        const role = VALID_ROLES.includes(loginStudent.role) ? loginStudent.role : 'student';
        if (role !== 'owner' && role !== 'admin') {
          return { statusCode: 403, headers, body: JSON.stringify({
            ok: false,
            error: `你不是管理员/站主，无权从「管理员入口」登录，请返回选择「用户入口」登录。`
          }) };
        }
      }
      const token = signToken(loginStudent);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          token: token,
          student: sanitizeStudent(loginStudent),
          matchedCandidates: matched.length,
          // 给前端直接判断：登录后该跳哪
          isOwner: loginStudent.role === 'owner',
          isAdmin: loginStudent.role === 'owner' || loginStudent.role === 'admin'
        })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('[student-login] FATAL:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
