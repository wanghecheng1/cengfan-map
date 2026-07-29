const https = require('https');
const crypto = require('crypto');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data/students.json';
const COMMUNITY_FILE_PATH = 'data/communities.json';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';
const STUDENT_SALT = process.env.STUDENT_TOKEN_SALT || 'cengfan-student-salt-2024';

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

const verifyAdmin = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
};

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

const writeFileContent = async (list, sha) => {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
  const body = {
    message: `Update students.json at ${new Date().toISOString()}`,
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
  // 20 次都失败，兜底用时间戳后 6 位
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
  // 500 次还重，升级 7 位
  if (length === 6) return generateUniquePassword(existingList, 7);
  return String(Date.now() + Math.floor(Math.random() * 1000)).slice(-7);
};
const ensureAllHasPasswords = (list) => {
  let filled = 0;
  for (let i = 0; i < list.length; i++) {
    if (!list[i].password || String(list[i].password).trim() === '') {
      list[i].password = generateUniquePassword(list);
      filled++;
    } else if (typeof list[i].password !== 'string') {
      list[i].password = String(list[i].password);
    }
  }
  return filled;
};

// ============ 同学端鉴权：通过姓名+密码查 student ============
const verifyStudentByName = (list, name, password) => {
  if (!name || !password) return null;
  const cleanName = String(name).trim();
  const cleanPass = String(password).trim();
  // 重名处理：逐一试密码，匹配到就算通过（返回对应 student）
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

    if (event.httpMethod === 'GET') {
      const { list } = await getFileContent();
      const isAdmin = verifyAdmin(event);
      // 脱敏：非管理员返回密码最后两位前加 **** 掩码，最后两位保留给前端校验显示占位
      const safeList = list.map(s => {
        const copy = { ...s };
        if (!isAdmin) {
          const p = String(copy.password || '');
          if (p.length >= 4) copy.password = '****' + p.slice(-2);
          else if (p.length > 0) copy.password = '****';
          else copy.password = '';
        }
        return copy;
      });
      return { statusCode: 200, headers, body: JSON.stringify(safeList) };
    }

    if (event.httpMethod === 'POST') {
      const path = event.path || '';
      // ==== 子路由 1：POST /api/students/batch-fill-passwords（管理员批量补空密码）====
      if (path.endsWith('/batch-fill-passwords')) {
        if (!verifyAdmin(event)) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
        }
        const { list, sha } = await getFileContent();
        const filled = ensureAllHasPasswords(list);
        await writeFileContent(list, sha);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, filledCount: filled, total: list.length })
        };
      }
      // ==== 子路由 2：POST /api/students/:id/reset-password（管理员重置单个密码）====
      if (/\/reset-password$/.test(path)) {
        if (!verifyAdmin(event)) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
        }
        const id = path.split('/').slice(-2)[0];
        const { list, sha } = await getFileContent();
        const idx = list.findIndex(s => s.id == id);
        if (idx === -1) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        }
        const newPass = generateUniquePassword(list);
        list[idx].password = newPass;
        await writeFileContent(list, sha);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, id: list[idx].id, nickname: list[idx].nickname, newPassword: newPass })
        };
      }
      // ==== 子路由 3：POST /api/students/:id/leave-community（同学自己退社；社长退社自动转让给下一位）====
      if (/\/leave-community$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
        const { list, sha } = await getFileContent();
        // 身份验证：双重保障
        // 1) 先用 X-Student-Token 确认 session 身份
        const headerToken = event.headers['x-student-token'] || event.headers['X-Student-Token'];
        const fromToken = headerToken ? parseStudentToken(String(headerToken), list) : null;
        // 2) 路径 id 对应 student 记录
        const targetIdx = list.findIndex(s => String(s.id) === String(id));
        if (targetIdx === -1) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: '同学档案不存在' }) };
        }
        const targetStudent = list[targetIdx];
        // 3) 密码二次确认（退社是敏感操作）
        const inputPassword = String(body.studentPassword || body.password || '').trim();
        const tokenMatched = fromToken && String(fromToken.id) === String(id);
        const passwordMatched = inputPassword && String(targetStudent.password || '') === inputPassword;
        // 必须 身份一致 + 密码正确
        if (!tokenMatched || !passwordMatched) {
          return { statusCode: 401, headers, body: JSON.stringify({
            error: '退社失败：请重新登录同学身份，并确保输入的密码正确（退社需密码二次确认）'
          }) };
        }
        const me = targetStudent;
        if (!me.communityId) {
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: '当前未加入任何社区', communityId: null }) };
        }
        // 读 communities 处理社长转让
        const { list: communities, sha: csha } = await getCommunityFile();
        const cidx = communities.findIndex(c => String(c.id) === String(me.communityId));
        if (cidx === -1) {
          // 社区已删除 → 只清空 communityId
          const sIdx = list.findIndex(s => s.id == me.id);
          list[sIdx].communityId = null;
          list[sIdx].communityName = '';
          await writeFileContent(list, sha);
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: '社区已删除，已退出', communityId: null }) };
        }
        const community = communities[cidx];
        // 先从 memberIds 移除我
        community.memberIds = (community.memberIds || []).filter(mid => String(mid) !== String(me.id));
        let autoTransferred = null;
        // 如果我是社长
        if (String(community.ownerId) === String(me.id)) {
          if (community.memberIds.length > 0) {
            // 自动转让给 memberIds 里最老的第一个（用户要求社长可以退出，自动转让）
            const newOwnerId = community.memberIds[0];
            community.ownerId = newOwnerId;
            autoTransferred = list.find(s => String(s.id) === String(newOwnerId));
          } else {
            // 最后一个成员：社长直接退，ownerId 置空，社区保留空壳（管理员可后续删除）
            community.ownerId = null;
            community.status = community.status || 'ownerless';
          }
        }
        // 写 communities
        communities[cidx] = community;
        await writeCommunityFile(communities, csha);
        // 写我自己的 communityId
        const sIdx = list.findIndex(s => s.id == me.id);
        list[sIdx].communityId = null;
        list[sIdx].communityName = '';
        await writeFileContent(list, sha);
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

      // ==== 默认 POST：新增档案（管理员）====
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const body = JSON.parse(event.body);
      console.log('[POST] New student:', body.nickname, body.province);
      const { list, sha } = await getFileContent();
      // 补全所有已有空密码（避免老数据空）
      ensureAllHasPasswords(list);
      const newPassword = (body.password && String(body.password).trim()) || generateUniquePassword(list);
      const newItem = {
        id: Date.now(),
        created_at: toBeijingTime(),
        ...body,
        hobbies: body.hobbies || [],
        looking_for_food: body.looking_for_food || false,
        wechat: body.wechat || '',
        qq: body.qq || '',
        title: body.title || '',
        // 头衔色号等级：0=无 1=金 2=银 3=铜 4=赤红字体 5=天蓝耀眼
        titleLevel: (body.titleLevel !== undefined && body.titleLevel !== null)
          ? (parseInt(body.titleLevel) || 0)
          : 0,
        password: newPassword,
        communityId: body.communityId || null,
        communityName: body.communityName || ''
      };
      list.push(newItem);
      await writeFileContent(list, sha);
      return { statusCode: 200, headers, body: JSON.stringify(newItem) };
    }

    if (event.httpMethod === 'PUT') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      const body = JSON.parse(event.body);
      console.log('[PUT] id:', id);
      const { list, sha } = await getFileContent();
      const idx = list.findIndex(s => s.id == id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      // 关键：合并字段，保留原有 id/created_at/wechat/qq/hobbies/password 等不丢失
      const oldItem = list[idx];
      // 全字段用兼容写法（不用 ??，避免与 || 混用报错）
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
        : ((parseInt(oldItem.titleLevel) || 0));
      // password：管理员没传就保留原密码；传了就用新值；原空就生成
      const newPassword = (body.password !== undefined && body.password !== null && String(body.password).trim() !== '')
        ? String(body.password)
        : (oldItem.password || generateUniquePassword(list));
      // communityId/communityName：管理员可改
      const newCommunityId = (body.communityId !== undefined && body.communityId !== null)
        ? body.communityId : (oldItem.communityId || null);
      const newCommunityName = (body.communityName !== undefined && body.communityName !== null)
        ? body.communityName : (oldItem.communityName || '');
      const merged = {
        ...oldItem,
        ...body,
        id: oldItem.id, // id 永远不变
        created_at: oldItem.created_at || toBeijingTime(), // 保留原创建时间
        hobbies: newHobbies,
        looking_for_food: newLooking,
        wechat: newWechat,
        qq: newQQ,
        title: newTitle,
        titleLevel: newTitleLevel,
        password: newPassword,
        communityId: newCommunityId,
        communityName: newCommunityName
      };
      list[idx] = merged;
      await writeFileContent(list, sha);
      return { statusCode: 200, headers, body: JSON.stringify(list[idx]) };
    }

    if (event.httpMethod === 'DELETE') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      console.log('[DELETE] id:', id);
      const { list, sha } = await getFileContent();
      const idx = list.findIndex(s => s.id == id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      list.splice(idx, 1);
      await writeFileContent(list, sha);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('[students] FATAL:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
