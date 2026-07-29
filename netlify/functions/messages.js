const https = require('https');
const crypto = require('crypto');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || ''; // e.g. "wanghecheng1/cengfan-map"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data/messages.json';
const STUDENTS_FILE_PATH = 'data/students.json';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';
const STUDENT_SALT = process.env.STUDENT_TOKEN_SALT || 'cengfan-student-salt-2024';

// 东八区时间格式化（不管服务器时区，强制 Asia/Shanghai）
const toBeijingTime = (date = new Date()) => {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(date).replace(/\//g, '-');
};

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// 解析 X-Student-Token（与 student-login.js 一致）；成功返回 student 对象
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

console.log('[messages-github] ENV check:');
console.log('  GITHUB_TOKEN:', GITHUB_TOKEN ? 'SET (' + GITHUB_TOKEN.substring(0, 8) + '...)' : 'MISSING');
console.log('  GITHUB_REPO:', GITHUB_REPO || 'MISSING');
console.log('  FILE_PATH:', FILE_PATH);

const verifyAdmin = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
};

const githubRequest = (method, repo, path, body = null, extraHeaders = {}) => {
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
        'Accept': 'application/vnd.github.v3+json',
        ...extraHeaders
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

const writeFileContent = async (list, sha) => {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
  const body = {
    message: `Update messages.json at ${new Date().toISOString()}`,
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

const getStudents = async () => {
  const res = await githubRequest('GET', GITHUB_REPO, STUDENTS_FILE_PATH);
  if (res.status === 200 && res.data && res.data.content) {
    const jsonStr = Buffer.from(res.data.content, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  }
  throw new Error(`Failed to read students: status ${res.status}`);
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-Student-Token',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
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

    if (event.httpMethod === 'GET') {
      const { list } = await getFileContent();
      return { statusCode: 200, headers, body: JSON.stringify(list) };
    }

    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
      const content = (body.content || '').toString().trim();
      if (!content) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '留言内容不能为空' }) };
      }
      console.log('[POST] New message content len:', content.length);

      // 1. 先尝试 X-Student-Token（session 态，无需前端存密码）
      let verifiedStudent = null;
      let matchedCandidates = 0;
      try {
        const students = await getStudents();
        const headerToken = event.headers['x-student-token'] || event.headers['X-Student-Token'];
        if (headerToken) {
          verifiedStudent = parseStudentToken(String(headerToken), students);
          if (verifiedStudent) matchedCandidates = 1;
        }
        // 2. 头信息失败则尝试 body 里的姓名+密码（兼容老表单/未登录同学）
        if (!verifiedStudent) {
          const rawName = (body.studentName || body.name || '').toString().trim();
          const rawPass = (body.studentPassword || body.password || '').toString().trim();
          if (rawName && rawPass) {
            const matched = students.filter(s => (s.nickname || '').toString().trim() === rawName);
            matchedCandidates = matched.length;
            for (const s of matched) {
              if (String(s.password || '').trim() === rawPass) { verifiedStudent = s; break; }
            }
          }
        }
      } catch (e) {
        console.warn('[messages] students 读取失败，降级匿名：', e.message);
        verifiedStudent = null;
      }

      const { list, sha } = await getFileContent();

      // 2. 后端强拼 name
      let finalName = '匿名校友';
      let verified = false;
      let realName = '';
      let studentId = null;
      let communityId = null;
      let communityName = '';
      if (verifiedStudent) {
        verified = true;
        realName = verifiedStudent.nickname || verifiedStudent.id;
        studentId = verifiedStudent.id;
        communityId = verifiedStudent.communityId || null;
        communityName = (verifiedStudent.communityName || '').toString().trim();
        finalName = communityName ? `${realName}(${communityName})` : realName;
      }

      const newItem = {
        id: Date.now(),
        name: finalName,
        realName: realName,
        verified: verified,
        studentId: studentId,
        communityId: communityId,
        communityName: communityName,
        content: content,
        created_at: toBeijingTime()
      };
      // 兼容老数据：后续 GET 时不输出敏感字段
      list.push(newItem);
      await writeFileContent(list, sha);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...newItem,
          // 额外前端提示
          _verifiedMeta: {
            matchedCandidates,
            mode: verified ? 'real' : 'anonymous',
            hasCommunity: verified ? !!communityName : false
          }
        })
      };
    }

    if (event.httpMethod === 'DELETE') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      console.log('[DELETE] id:', id);
      const { list, sha } = await getFileContent();
      const idx = list.findIndex(m => m.id == id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      list.splice(idx, 1);
      await writeFileContent(list, sha);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('[messages] FATAL:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
