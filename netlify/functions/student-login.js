const https = require('https');
const crypto = require('crypto');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data/students.json';
const STUDENT_SALT = process.env.STUDENT_TOKEN_SALT || 'cengfan-student-salt-2024';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 2; // 2天有效，sessionStorage 关闭就没实际不会用到这么久

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

const getStudents = async () => {
  const res = await githubRequest('GET', GITHUB_REPO, FILE_PATH);
  if (res.status === 200 && res.data && res.data.content) {
    const jsonStr = Buffer.from(res.data.content, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  }
  throw new Error(`Failed to read students: status ${res.status}`);
};

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

const signToken = (student) => {
  const payload = {
    id: student.id,
    nickname: student.nickname,
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
    // 签名用 password 后 4 位 + SALT + id，这样管理员重置密码后旧 token 自动失效
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
  // 校验签名
  const recomputed = md5(JSON.stringify(payload) + STUDENT_SALT);
  if (recomputed !== sign) return null;
  // 过期
  if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
  // 查对应 student
  const student = list.find(s => String(s.id) === String(payload.id));
  if (!student) return null;
  // 校验 passTail 是否一致（密码被改就失效）
  const curTail = String(student.password || '').slice(-4);
  if (payload.passTail !== curTail) return null;
  return student;
};

const sanitizeStudent = (s) => ({
  id: s.id,
  nickname: s.nickname,
  title: s.title || '',
  titleLevel: s.titleLevel || 0,
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
});

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
    const list = await getStudents();

    // ==== S2：POST /api/student-login/me  校验会话 ====
    if (path.endsWith('/me') || path.endsWith('/verify') || event.httpMethod === 'GET') {
      let token = null;
      if (event.httpMethod === 'POST') {
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
        token = body.token || body.studentToken;
      } else {
        // GET ?token=xxx 或 header X-Student-Token
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

    // ==== S1：POST /api/student-login  姓名+密码登录 ====
    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
      const name = String(body.studentName || body.name || '').trim();
      const password = String(body.studentPassword || body.password || '').trim();
      if (!name || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: '请输入姓名和密码' }) };
      }
      // 重名逐个匹配
      const matched = list.filter(s => (s.nickname || '').trim() === name);
      if (matched.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: '未找到该同学姓名，请核对后重试' }) };
      }
      let loginStudent = null;
      for (const s of matched) {
        if (String(s.password || '').trim() === password) { loginStudent = s; break; }
      }
      if (!loginStudent) {
        return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: matched.length > 1 ? '密码错误，若有重名请联系管理员核对' : '密码错误' }) };
      }
      const token = signToken(loginStudent);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          token: token,
          student: sanitizeStudent(loginStudent),
          matchedCandidates: matched.length
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
