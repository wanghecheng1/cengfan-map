const https = require('https');
const crypto = require('crypto');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';
const STUDENT_SALT = process.env.STUDENT_TOKEN_SALT || 'cengfan-student-salt-2024';
const FILE_DM = 'data/direct-messages.json';
const FILE_STUDENTS = 'data/students.json';
const MAX_MSGS_PER_CONV = 500;
const VALID_RECIPIENT_TYPES = ['admin', 'owner'];

// V5：每条 DM 自动迁移：新增 recipientType 字段（同学发给的对象是谁？ admin=私信管理员；owner=私信站主）
// - 老数据：如果没有 recipientType，默认为 'admin'（因为旧版都是发给管理员的私信）
const migrateDmV5 = (all) => all.map(m => {
  if (VALID_RECIPIENT_TYPES.includes(String(m.recipientType || ''))) return m;
  return { ...m, recipientType: 'admin' };
});
// 身份辅助：X-Student-Token 拿到后顺便拿身份（role）
const isOwnerStudent = (s) => !!s && (String(s.role || '') === 'owner');
const isAdminStudent = (s) => !!s && (String(s.role || '') === 'owner' || String(s.role || '') === 'admin');

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

const toBeijingTime = (date = new Date()) => {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(date).replace(/\//g, '-');
};
const verifyAdmin = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
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
const readFile = async (path) => {
  const res = await githubRequest('GET', GITHUB_REPO, path);
  if (res.status === 200 && res.data && res.data.content) {
    const str = Buffer.from(res.data.content, 'base64').toString('utf-8');
    return { list: JSON.parse(str), sha: res.data.sha };
  }
  throw new Error(`Failed to read ${path}: status ${res.status}`);
};
const writeFile = async (path, list, sha, msg) => {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
  const body = {
    message: msg || `Update ${path} at ${new Date().toISOString()}`,
    content, sha, branch: GITHUB_BRANCH
  };
  const res = await githubRequest('PUT', GITHUB_REPO, path, body);
  if (res.status === 200 || res.status === 201) return;
  throw new Error(`Failed to write ${path}: status ${res.status}`);
};
const verifyStudent = (students, name, password) => {
  if (!name || !password) return null;
  const cName = String(name).trim();
  const cPass = String(password).trim();
  for (const s of students) {
    if ((s.nickname || '').trim() === cName && String(s.password || '') === cPass) return s;
  }
  return null;
};

// 把某会话消息数截断到上限（只留最新的），返回 {trimmed, removed}
const trimConv = (allMsgs, studentId) => {
  const convMsgs = allMsgs.filter(m => String(m.studentId) === String(studentId));
  if (convMsgs.length <= MAX_MSGS_PER_CONV) return { trimmed: allMsgs, removed: 0 };
  const removeIds = new Set(convMsgs.slice(0, convMsgs.length - MAX_MSGS_PER_CONV).map(m => String(m.id)));
  return {
    trimmed: allMsgs.filter(m => !removeIds.has(String(m.id))),
    removed: removeIds.size
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
    if (!GITHUB_TOKEN || !GITHUB_REPO) return { statusCode: 500, headers, body: JSON.stringify({ error: 'GitHub not configured' }) };

    const path = (event.path || '').replace(/\/+$/, '');
    const qs = event.queryStringParameters || {};
    const isAdmin = verifyAdmin(event);

    // ============== DM1: GET /api/direct-messages 会话列表 / 单会话明细 ==============
    if (event.httpMethod === 'GET') {
      const { list: students } = await readFile(FILE_STUDENTS);
      const { list: rawAll } = await readFile(FILE_DM);
      const all = migrateDmV5(rawAll);

      // V5：三种 viewer 模式：
      //   1) isAdmin (全局超级管理员 ADMIN_TOKEN)：看全部（兼容旧版兜底）
      //   2) 同学 token 解析出是 owner（站主）：只看 recipientType ∈ {'admin','owner'} 的（两类都看）
      //   3) 同学 token 解析出是 admin（管理员）：只看 recipientType='admin' 的
      //   4) 普通同学：只看自己 studentId 的全部（admin+owner 他们发给自己的）
      let viewerStudentId = null;
      let viewerRole = null; // null(超级管理员/未登录)/'owner'/'admin'/'student'
      let meStudent = null;
      if (isAdmin) {
        viewerRole = null; // 超级管理员：看全部
      } else {
        const headerToken = event.headers['x-student-token'] || event.headers['X-Student-Token'];
        if (headerToken) meStudent = parseStudentToken(String(headerToken), students);
        if (!meStudent) {
          const name = qs.studentName || qs.name;
          const password = qs.studentPassword || qs.password;
          meStudent = verifyStudent(students, name, password);
        }
        if (!meStudent) return { statusCode: 401, headers, body: JSON.stringify({ error: '请输入正确姓名+密码或重新登录' }) };
        viewerStudentId = String(meStudent.id);
        const r = String(meStudent.role || '');
        viewerRole = (r === 'owner' || r === 'admin' || r === 'student') ? r : 'student';
      }

      // 过滤（V5：区分 viewerRole 和 byStudentId 两种维度）
      //   byStudentId = 查具体"同学本人的单会话（消息明细）"
      //   无 byStudentId = 查"管理员收件箱的会话列表"（仅管理员/站主/超级管理员可看）
      const byStudentId = qs.studentId;
      let filtered = all;
      // A. 如果指定了 byStudentId → 明细模式
      if (byStudentId) {
        if (viewerStudentId) {
          // 自己查自己：不限身份；但如果是用 owner/admin token 查别人的 byStudentId，需要验证权限
          if (String(byStudentId) !== viewerStudentId) {
            // owner/admin 登录可以查任意同学的会话消息（但按 recipientType 过滤他们角色允许看到的）
            if (viewerRole !== 'owner' && viewerRole !== 'admin') {
              return { statusCode: 403, headers, body: JSON.stringify({ error: '不能查看他人会话' }) };
            }
            // owner 允许看某同学 admin+owner 两类；管理员只允许看 admin
            if (viewerRole === 'owner') {
              filtered = all.filter(m => String(m.studentId) === String(byStudentId)
                && (String(m.recipientType || 'admin') === 'admin' || String(m.recipientType || 'admin') === 'owner'));
            } else {
              filtered = all.filter(m => String(m.studentId) === String(byStudentId) && String(m.recipientType || 'admin') === 'admin');
            }
          } else {
            // 自己查自己的全部（含 admin+owner，方便统一展示）
            filtered = all.filter(m => String(m.studentId) === viewerStudentId);
          }
        } else {
          // 超级管理员后台：byStudentId 指定 → 看该同学全部
          filtered = all.filter(m => String(m.studentId) === String(byStudentId));
        }
      } else {
        // B. 无 byStudentId → 会话列表模式
        if (viewerRole === 'owner') {
          // 站主看 admin+owner 两类会话
          filtered = all.filter(m => String(m.recipientType || 'admin') === 'admin' || String(m.recipientType || 'admin') === 'owner');
        } else if (viewerRole === 'admin') {
          // 普通管理员只看 admin
          filtered = all.filter(m => String(m.recipientType || 'admin') === 'admin');
        } else if (viewerStudentId) {
          // 普通同学：看自己的（兼容旧行为）
          filtered = all.filter(m => String(m.studentId) === viewerStudentId);
        } else if (isAdmin) {
          // 超级管理员看全部
          filtered = all;
        } else {
          return { statusCode: 401, headers, body: JSON.stringify({ error: '请登录后再查看' }) };
        }
      }

      // 构造返回：
      // - 指定了 studentId：返回该会话按时间升序消息（同时把管理员发给我的未读标成已读）
      // - 没指定：返回管理员会话列表（按 studentId 分组，含最后一条+未读统计）
      const targetId = viewerStudentId || byStudentId;
      if (targetId) {
        // 排序
        const sorted = [...filtered].sort((a, b) => {
          const ta = a.created_at ? String(a.created_at) : '';
          const tb = b.created_at ? String(b.created_at) : '';
          return ta.localeCompare(tb);
        });
        // 标已读：管理员打开 = 标 student 发给 admin 的全部已读；同学端打开 = 标 admin 发给 student 的已读
        if (sorted.length > 0) {
          let changed = false;
          const markSender = isAdmin ? 'student' : 'admin';
          for (let i = 0; i < sorted.length; i++) {
            const m = sorted[i];
            if (String(m.studentId) === String(targetId) && m.sender === markSender && !m.read) {
              m.read = true;
              m.read_at = toBeijingTime();
              changed = true;
            }
          }
          if (changed) {
            // 回写 allMsgs（all 中找 id）
            const byId = new Map(sorted.filter(m => m.read && m.read_at).map(m => [String(m.id), m]));
            const { sha } = await readFile(FILE_DM);
            const reRead = await readFile(FILE_DM);
            for (const msg of reRead.list) {
              if (byId.has(String(msg.id))) Object.assign(msg, byId.get(String(msg.id)));
            }
            await writeFile(FILE_DM, reRead.list, reRead.sha);
          }
        }
        const sObj = students.find(s => String(s.id) === String(targetId));
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            mode: 'conversation',
            studentId: targetId,
            studentName: sObj ? (sObj.nickname || sObj.id) : '',
            messages: sorted
          })
        };
      }

      // V5：管理员会话列表分组 key = studentId|recipientType
      const groups = new Map();
      for (const m of filtered) {
        const sid = String(m.studentId);
        const rt = VALID_RECIPIENT_TYPES.includes(String(m.recipientType || '')) ? String(m.recipientType) : 'admin';
        const gk = `${sid}|${rt}`;
        if (!groups.has(gk)) groups.set(gk, []);
        groups.get(gk).push(m);
      }
      const conversations = [];
      for (const [gk, msgs] of groups) {
        const [sid, rt] = gk.split('|');
        const sorted = [...msgs].sort((a, b) => {
          const ta = a.created_at ? String(a.created_at) : '';
          const tb = b.created_at ? String(b.created_at) : '';
          return ta.localeCompare(tb);
        });
        const last = sorted[sorted.length - 1];
        const unread = msgs.filter(m => m.sender === 'student' && !m.read).length;
        const sObj = students.find(s => String(s.id) === sid);
        conversations.push({
          studentId: sid,
          studentName: sObj ? (sObj.nickname || sid) : sid,
          titleLevel: sObj ? (sObj.titleLevel || 0) : 0,
          recipientType: rt,
          recipientTypeLabel: rt === 'owner' ? '👑 私信站主' : '🛡️ 私信管理员',
          lastMessage: last ? last.content : '',
          lastMessageAt: last ? (last.created_at || '') : '',
          lastSender: last ? (last.sender || '') : '',
          unread,
          totalMessages: msgs.length,
          convKey: gk
        });
      }
      // 按最后消息时间倒序
      conversations.sort((a, b) => {
        const ta = a.lastMessageAt || '';
        const tb = b.lastMessageAt || '';
        return tb.localeCompare(ta);
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          mode: 'list',
          viewerRole, // 'owner'/'admin'/'student'/null
          conversations,
          total: conversations.length
        })
      };
    }

    // ============== DM2/DM3: POST /api/direct-messages(/mark-read)  发送消息 / 标已读 ==============
    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }

      // ---- DM3: POST /api/direct-messages/mark-read  标已读 ----
      if (path.endsWith('/mark-read')) {
        const { list: students } = await readFile(FILE_STUDENTS);
        const { list: rawAll, sha } = await readFile(FILE_DM);
        const all = migrateDmV5(rawAll);
        let changed = 0;
        let targetStudentId = null;
        // V5：标记已读时也区分 recipientType
        const bodyRt = VALID_RECIPIENT_TYPES.includes(String(body.recipientType || '')) ? String(body.recipientType) : null;
        if (isAdmin) {
          targetStudentId = body.studentId ? String(body.studentId) : null;
          const markSender = 'student';
          for (const m of all) {
            const matchSid = targetStudentId ? String(m.studentId) === String(targetStudentId) : true;
            const matchRt = bodyRt ? String(m.recipientType || 'admin') === bodyRt : true;
            if (matchSid && matchRt && m.sender === markSender && !m.read) {
              m.read = true;
              m.read_at = toBeijingTime();
              changed++;
            }
          }
        } else {
          let me = null;
          const headerToken = event.headers['x-student-token'] || event.headers['X-Student-Token'];
          if (headerToken) me = parseStudentToken(String(headerToken), students);
          if (!me) me = verifyStudent(students, body.studentName, body.studentPassword);
          if (!me) return { statusCode: 401, headers, body: JSON.stringify({ error: '身份验证失败' }) };
          targetStudentId = String(me.id);
          for (const m of all) {
            const matchRt = bodyRt ? String(m.recipientType || 'admin') === bodyRt : true;
            if (String(m.studentId) === targetStudentId && matchRt && m.sender === 'admin' && !m.read) {
              m.read = true;
              m.read_at = toBeijingTime();
              changed++;
            }
          }
        }
        if (changed > 0) await writeFile(FILE_DM, all, sha, `DM mark-read (${changed})`);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, markedCount: changed, targetStudentId, recipientType: bodyRt }) };
      }

      // ---- DM2: 默认 POST → 发送消息 ----
      const content = String(body.content || '').trim();
      if (!content) return { statusCode: 400, headers, body: JSON.stringify({ error: '内容不能为空' }) };
      if (content.length > 1000) return { statusCode: 400, headers, body: JSON.stringify({ error: '单条消息不超过1000字' }) };

      const { list: students } = await readFile(FILE_STUDENTS);
      const { list: rawAll, sha } = await readFile(FILE_DM);
      const all = migrateDmV5(rawAll);
      let sender, studentId, studentName;
      // V5：recipientType（私信对象：admin=私信管理员；owner=私信站主）
      let recipientType = VALID_RECIPIENT_TYPES.includes(String(body.recipientType || '')) ? String(body.recipientType) : 'admin';

      if (isAdmin) {
        sender = 'admin';
        studentId = String(body.studentId || '').trim();
        if (!studentId) return { statusCode: 400, headers, body: JSON.stringify({ error: '管理员发送请指定 studentId' }) };
        const s = students.find(x => String(x.id) === studentId);
        if (!s) return { statusCode: 404, headers, body: JSON.stringify({ error: '同学不存在' }) };
        studentName = s.nickname || studentId;
        // V5：管理员/站主回复该同学某条私信 → 保持对方发过来时的 recipientType；body 如果指定了就以 body 为准
        if (body.recipientType && VALID_RECIPIENT_TYPES.includes(String(body.recipientType))) {
          recipientType = String(body.recipientType);
        } else {
          // 默认：找这个同学最近一条 student 发给我的那条，沿用它的 recipientType
          const lastStudentMsg = [...all]
            .filter(m => String(m.studentId) === studentId && m.sender === 'student')
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
          if (lastStudentMsg && VALID_RECIPIENT_TYPES.includes(String(lastStudentMsg.recipientType || ''))) {
            recipientType = String(lastStudentMsg.recipientType);
          }
        }
      } else {
        sender = 'student';
        let me = null;
        const headerToken = event.headers['x-student-token'] || event.headers['X-Student-Token'];
        if (headerToken) me = parseStudentToken(String(headerToken), students);
        if (!me) me = verifyStudent(students, body.studentName, body.studentPassword);
        if (!me) return { statusCode: 401, headers, body: JSON.stringify({ error: '身份验证失败，请重新登录' }) };
        studentId = String(me.id);
        studentName = me.nickname || studentId;
      }

      const newMsg = {
        id: 'dm_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        studentId,
        studentName,
        sender,
        recipientType,
        content,
        created_at: toBeijingTime(),
        read: false,
        read_at: null
      };
      let nextList = all.concat([newMsg]);
      const { trimmed, removed } = trimConv(nextList, studentId);
      await writeFile(FILE_DM, trimmed, sha, removed ? `DM ${sender}->${recipientType} ${studentId} (trim ${removed})` : `DM ${sender}->${recipientType} ${studentId}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, message: newMsg, recipientType, trimmedOldMsgs: removed })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('[direct-messages] FATAL:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
