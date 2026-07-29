const https = require('https');
const crypto = require('crypto');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';
const STUDENT_SALT = process.env.STUDENT_TOKEN_SALT || 'cengfan-student-salt-2024';

const FILE_COMMUNITIES = 'data/communities.json';
const FILE_CREATE_REQ = 'data/community-create-requests.json';
const FILE_JOIN_REQ = 'data/community-join-requests.json';
const FILE_STUDENTS = 'data/students.json';

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

// 统一的同学身份验证：优先 X-Student-Token，回退 姓名+密码
const verifyStudentAny = (event, students, bodyName, bodyPassword) => {
  const headerToken = event.headers['x-student-token'] || event.headers['X-Student-Token'];
  if (headerToken) {
    const s = parseStudentToken(String(headerToken), students);
    if (s) return s;
  }
  return verifyStudent(students, bodyName, bodyPassword);
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

const readJsonFile = async (path) => {
  const res = await githubRequest('GET', GITHUB_REPO, path);
  if (res.status === 200 && res.data && res.data.content) {
    const jsonStr = Buffer.from(res.data.content, 'base64').toString('utf-8');
    return { list: JSON.parse(jsonStr), sha: res.data.sha };
  }
  throw new Error(`Failed to read ${path}: status ${res.status}`);
};
const writeJsonFile = async (path, list, sha, msg) => {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
  const body = {
    message: msg || `Update ${path} at ${new Date().toISOString()}`,
    content,
    sha,
    branch: GITHUB_BRANCH
  };
  const res = await githubRequest('PUT', GITHUB_REPO, path, body);
  if (res.status === 200 || res.status === 201) return;
  throw new Error(`Failed to write ${path}: status ${res.status}`);
};

// 同学端鉴权：姓名+密码；重名时逐个比密码
const verifyStudent = (students, name, password) => {
  if (!name || !password) return null;
  const cleanName = String(name).trim();
  const cleanPass = String(password).trim();
  for (const s of students) {
    if ((s.nickname || '').trim() === cleanName && String(s.password || '') === cleanPass) return s;
  }
  return null;
};

// 写回 student：更新 communityId/communityName（双写）
const updateStudentCommunity = async (students, sha, studentId, communityId, communityName) => {
  const idx = students.findIndex(s => String(s.id) === String(studentId));
  if (idx === -1) return null;
  students[idx].communityId = communityId || null;
  students[idx].communityName = communityId ? (communityName || students[idx].communityName || '') : '';
  await writeJsonFile(FILE_STUDENTS, students, sha, `Update student ${studentId} community`);
  return students[idx];
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

    const path = (event.path || '').replace(/\/+$/, '');
    const method = event.httpMethod;

    // ===== 公共 GET：社区列表（公开可读，不含成员手机号/密码）=====
    if (method === 'GET') {
      const { list: communities } = await readJsonFile(FILE_COMMUNITIES);
      const { list: students } = await readJsonFile(FILE_STUDENTS);
      // 附带 ownerName / memberCount / ownerTitleLevel 给前端用
      const decorated = communities.map(c => {
        const owner = students.find(s => String(s.id) === String(c.ownerId));
        const memberCount = (c.memberIds || []).length;
        return {
          ...c,
          ownerName: owner ? (owner.nickname || owner.id) : '',
          ownerTitleLevel: owner ? (owner.titleLevel || 0) : 0,
          memberCount: memberCount
        };
      });
      // 附带：创建申请 & 加入申请数（仅管理员查看时给明细？）
      let extra = {};
      if (verifyAdmin(event)) {
        const { list: createReqs } = await readJsonFile(FILE_CREATE_REQ);
        const { list: joinReqs } = await readJsonFile(FILE_JOIN_REQ);
        extra = {
          pendingCreateReqs: createReqs.filter(r => r.status === 'pending').length,
          pendingJoinReqs: joinReqs.filter(r => r.status === 'pending').length,
          allCreateReqs: createReqs,
          allJoinReqs: joinReqs
        };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ communities: decorated, ...extra }) };
    }

    // ===== 所有 POST/PUT/DELETE 需根据子路由 dispatch =====
    if (method === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
      const { list: students, sha: ssha } = await readJsonFile(FILE_STUDENTS);
      const { list: communities, sha: csha } = await readJsonFile(FILE_COMMUNITIES);
      const { list: createReqs, sha: crsha } = await readJsonFile(FILE_CREATE_REQ);
      const { list: joinReqs, sha: jrsha } = await readJsonFile(FILE_JOIN_REQ);

      // --- C1: POST /api/communities/create-request  同学发起创建申请（优先 X-Student-Token，回退姓名+密码）---
      if (path.endsWith('/create-request')) {
        const me = verifyStudentAny(event, students, body.studentName, body.studentPassword);
        if (!me) return { statusCode: 401, headers, body: JSON.stringify({ error: '身份验证失败，请重新登录或输入正确密码' }) };
        if (me.communityId) return { statusCode: 400, headers, body: JSON.stringify({ error: '您已加入社区，需先退出再申请创建' }) };
        // 不能重复申请
        const myPending = createReqs.find(r => String(r.creatorStudentId) === String(me.id) && r.status === 'pending');
        if (myPending) return { statusCode: 400, headers, body: JSON.stringify({ error: '您已有创建申请待审批，请耐心等待' }) };
        const communityName = String(body.communityName || '').trim();
        if (!communityName) return { statusCode: 400, headers, body: JSON.stringify({ error: '请填写社区名称' }) };
        if (communityName.length > 16) return { statusCode: 400, headers, body: JSON.stringify({ error: '社区名称不超过16字' }) };
        // 社区名不能重名
        if (communities.find(c => (c.name || '').trim() === communityName)) {
          return { statusCode: 409, headers, body: JSON.stringify({ error: '社区名称已存在，请换一个' }) };
        }
        const req = {
          id: 'cr_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          creatorStudentId: me.id,
          creatorName: me.nickname,
          communityName,
          communityIntro: String(body.communityIntro || '').slice(0, 200),
          status: 'pending',
          created_at: toBeijingTime(),
          reviewed_by: null,
          reviewed_at: null,
          rejectReason: ''
        };
        createReqs.push(req);
        await writeJsonFile(FILE_CREATE_REQ, createReqs, crsha);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, request: req }) };
      }

      // --- C2: POST /api/communities/join-request  同学发起加入申请（优先 X-Student-Token）---
      if (path.endsWith('/join-request')) {
        const me = verifyStudentAny(event, students, body.studentName, body.studentPassword);
        if (!me) return { statusCode: 401, headers, body: JSON.stringify({ error: '身份验证失败，请重新登录或输入正确密码' }) };
        if (me.communityId) return { statusCode: 400, headers, body: JSON.stringify({ error: '您已加入社区，一个人只能选择一个社区，请先退出再申请' }) };
        const communityId = String(body.communityId || '').trim();
        const community = communities.find(c => String(c.id) === communityId);
        if (!community) return { statusCode: 404, headers, body: JSON.stringify({ error: '社区不存在' }) };
        const myPending = joinReqs.find(r => String(r.studentId) === String(me.id) && r.status === 'pending');
        if (myPending) return { statusCode: 400, headers, body: JSON.stringify({ error: '您已有加入申请待审批' }) };
        const req = {
          id: 'jr_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          studentId: me.id,
          studentName: me.nickname,
          communityId,
          communityName: community.name,
          applyNote: String(body.applyNote || '').slice(0, 100),
          status: 'pending',
          created_at: toBeijingTime(),
          decided_by_role: null, // 'admin' | 'owner'
          decided_by_id: null,
          decided_at: null,
          rejectReason: ''
        };
        joinReqs.push(req);
        await writeJsonFile(FILE_JOIN_REQ, joinReqs, jrsha);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, request: req }) };
      }

      // --- C3: POST /api/communities/create-request/:id/approve  管理员审批创建（通过）---
      if (/\/create-request\/[^/]+\/approve$/.test(path)) {
        if (!verifyAdmin(event)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
        const id = path.split('/').slice(-2)[0];
        const idx = createReqs.findIndex(r => r.id === id);
        if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '申请不存在' }) };
        const req = createReqs[idx];
        if (req.status !== 'pending') return { statusCode: 400, headers, body: JSON.stringify({ error: '申请已处理' }) };
        if (communities.find(c => (c.name || '').trim() === (req.communityName || '').trim())) {
          return { statusCode: 409, headers, body: JSON.stringify({ error: '社区名称已存在，请拒绝并提示换名' }) };
        }
        const newCommunity = {
          id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          name: req.communityName,
          intro: req.communityIntro || '',
          ownerId: req.creatorStudentId,
          memberIds: [req.creatorStudentId],
          created_at: toBeijingTime(),
          createdByRequestId: req.id,
          status: 'active'
        };
        communities.push(newCommunity);
        // 审批状态
        req.status = 'approved';
        req.reviewed_at = toBeijingTime();
        // 双写：该同学加入此社区
        const owner = await updateStudentCommunity(students, ssha, req.creatorStudentId, newCommunity.id, newCommunity.name);
        await writeJsonFile(FILE_COMMUNITIES, communities, csha);
        await writeJsonFile(FILE_CREATE_REQ, createReqs, crsha);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, community: { ...newCommunity, memberCount: 1, ownerName: owner ? owner.nickname : '' }, request: req })
        };
      }
      // --- C3-2: POST /api/communities/create-request/:id/reject ---
      if (/\/create-request\/[^/]+\/reject$/.test(path)) {
        if (!verifyAdmin(event)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
        const id = path.split('/').slice(-2)[0];
        const idx = createReqs.findIndex(r => r.id === id);
        if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '申请不存在' }) };
        createReqs[idx].status = 'rejected';
        createReqs[idx].reviewed_at = toBeijingTime();
        createReqs[idx].rejectReason = String(body.reason || '').slice(0, 200);
        await writeJsonFile(FILE_CREATE_REQ, createReqs, crsha);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, request: createReqs[idx] }) };
      }

      // --- C4: POST /api/communities/join-request/:id/approve  社长或管理员审批加入申请（通过）---
      if (/\/join-request\/[^/]+\/approve$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        const idx = joinReqs.findIndex(r => r.id === id);
        if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '申请不存在' }) };
        const req = joinReqs[idx];
        if (req.status !== 'pending') return { statusCode: 400, headers, body: JSON.stringify({ error: '申请已处理' }) };
        const community = communities.find(c => String(c.id) === String(req.communityId));
        if (!community) return { statusCode: 404, headers, body: JSON.stringify({ error: '社区不存在' }) };
        // 权限：管理员 OR 该社社长（社长优先 X-Student-Token）
        const isAdmin = verifyAdmin(event);
        const me = verifyStudentAny(event, students, body.studentName, body.studentPassword);
        const isOwner = me && String(community.ownerId) === String(me.id);
        if (!isAdmin && !isOwner) return { statusCode: 403, headers, body: JSON.stringify({ error: '仅社长或管理员可审批' }) };
        // 检查学生当前是否已加入其它社区
        const student = students.find(s => String(s.id) === String(req.studentId));
        if (!student) return { statusCode: 404, headers, body: JSON.stringify({ error: '学生档案不存在' }) };
        if (student.communityId) return { statusCode: 400, headers, body: JSON.stringify({ error: '该生已加入其它社区，请先退出' }) };
        // 加入
        if (!community.memberIds) community.memberIds = [];
        if (!community.memberIds.some(mid => String(mid) === String(req.studentId))) {
          community.memberIds.push(req.studentId);
        }
        const cIdx = communities.findIndex(c => String(c.id) === String(community.id));
        communities[cIdx] = community;
        req.status = 'approved';
        req.decided_at = toBeijingTime();
        req.decided_by_role = isAdmin ? 'admin' : 'owner';
        req.decided_by_id = isAdmin ? 'admin' : (me ? me.id : null);
        await updateStudentCommunity(students, ssha, req.studentId, community.id, community.name);
        await writeJsonFile(FILE_COMMUNITIES, communities, csha);
        await writeJsonFile(FILE_JOIN_REQ, joinReqs, jrsha);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, request: req, community }) };
      }
      // --- C4-2: POST /api/communities/join-request/:id/reject ---
      if (/\/join-request\/[^/]+\/reject$/.test(path)) {
        const id = path.split('/').slice(-2)[0];
        const idx = joinReqs.findIndex(r => r.id === id);
        if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '申请不存在' }) };
        const req = joinReqs[idx];
        if (req.status !== 'pending') return { statusCode: 400, headers, body: JSON.stringify({ error: '申请已处理' }) };
        const community = communities.find(c => String(c.id) === String(req.communityId));
        const isAdmin = verifyAdmin(event);
        const me = verifyStudentAny(event, students, body.studentName, body.studentPassword);
        const isOwner = community && me && String(community.ownerId) === String(me.id);
        if (!isAdmin && !isOwner) return { statusCode: 403, headers, body: JSON.stringify({ error: '仅社长或管理员可拒绝' }) };
        req.status = 'rejected';
        req.decided_at = toBeijingTime();
        req.decided_by_role = isAdmin ? 'admin' : 'owner';
        req.decided_by_id = isAdmin ? 'admin' : (me ? me.id : null);
        req.rejectReason = String(body.reason || '').slice(0, 200);
        await writeJsonFile(FILE_JOIN_REQ, joinReqs, jrsha);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, request: req }) };
      }

      // --- C7: POST /api/communities/:id/remove-member  管理员移出某社员（双写）---
      if (/\/communities\/[^/]+\/remove-member$/.test(path)) {
        if (!verifyAdmin(event)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
        const communityId = path.split('/').slice(-2)[0];
        const cIdx = communities.findIndex(c => String(c.id) === String(communityId));
        if (cIdx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '社区不存在' }) };
        const targetStudentId = String(body.studentId || '').trim();
        if (!targetStudentId) return { statusCode: 400, headers, body: JSON.stringify({ error: '请指定 studentId' }) };
        const community = communities[cIdx];
        // 社长不能直接被移出（必须先手动转让）
        if (String(community.ownerId) === String(targetStudentId)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '不能直接移出社长，请先转让社长再移出' }) };
        }
        community.memberIds = (community.memberIds || []).filter(mid => String(mid) !== String(targetStudentId));
        communities[cIdx] = community;
        // 双写 students
        const sIdx = students.findIndex(s => String(s.id) === String(targetStudentId));
        let removedName = targetStudentId;
        if (sIdx !== -1) {
          students[sIdx].communityId = null;
          students[sIdx].communityName = '';
          removedName = students[sIdx].nickname || targetStudentId;
          await writeJsonFile(FILE_STUDENTS, students, ssha, `Admin remove ${targetStudentId} from ${communityId}`);
        }
        await writeJsonFile(FILE_COMMUNITIES, communities, csha);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, removedStudentId: targetStudentId, removedName, communityId, memberCountNow: (community.memberIds || []).length }) };
      }

      // --- C5: POST /api/communities/:id/transfer  社长转让（优先 X-Student-Token，回退 姓名+密码）---
      if (/\/communities\/[^/]+\/transfer$/.test(path)) {
        const communityId = path.split('/').slice(-2)[0];
        const cIdx = communities.findIndex(c => String(c.id) === communityId);
        if (cIdx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '社区不存在' }) };
        const community = communities[cIdx];
        const isAdmin = verifyAdmin(event);
        const me = verifyStudentAny(event, students, body.studentName, body.studentPassword);
        const isOwner = me && String(community.ownerId) === String(me.id);
        if (!isAdmin && !isOwner) return { statusCode: 403, headers, body: JSON.stringify({ error: '仅社长或管理员可转让' }) };
        const targetId = String(body.targetStudentId || '').trim();
        if (!targetId) return { statusCode: 400, headers, body: JSON.stringify({ error: '请指定目标成员' }) };
        if (String(targetId) === String(community.ownerId)) return { statusCode: 400, headers, body: JSON.stringify({ error: '不能转让给自己' }) };
        // 目标必须是该社成员
        if (!(community.memberIds || []).some(mid => String(mid) === targetId)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '目标非本社成员，请先让其加入' }) };
        }
        community.ownerId = targetId;
        communities[cIdx] = community;
        await writeJsonFile(FILE_COMMUNITIES, communities, csha);
        const target = students.find(s => String(s.id) === targetId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, community, newOwnerName: target ? target.nickname : targetId })
        };
      }

      // --- C6: DELETE /api/communities/:id  管理员删除社区（同时把所有成员 communityId 清掉）---
      if (method === 'POST' && /\/delete$/.test(path) && path.indexOf('/delete') === path.length - 7 && /\/communities\/[^/]+\/delete$/.test(path)) {
        // (不走这，实际用 DELETE)
      }
    }

    // --- C6：DELETE /api/communities/:id  管理员删社区 ---
    if (method === 'DELETE') {
      const pathSegs = path.split('/').filter(Boolean);
      // /api/communities/:id
      const id = pathSegs[pathSegs.length - 1];
      if (!/^c_/.test(id) && !verifyAdmin(event)) {
        // 没带 c_ 前缀的可能不是社区 id，走 join/create req 删除
      }
      if (!verifyAdmin(event)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      const { list: students, sha: ssha } = await readJsonFile(FILE_STUDENTS);
      const { list: communities, sha: csha } = await readJsonFile(FILE_COMMUNITIES);
      const cIdx = communities.findIndex(c => String(c.id) === String(id));
      if (cIdx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: '社区不存在' }) };
      const removed = communities[cIdx];
      // 清成员社区
      const members = removed.memberIds || [];
      for (const mid of members) {
        const sIdx = students.findIndex(s => String(s.id) === String(mid));
        if (sIdx !== -1) {
          students[sIdx].communityId = null;
          students[sIdx].communityName = '';
        }
      }
      communities.splice(cIdx, 1);
      await writeJsonFile(FILE_STUDENTS, students, ssha, `Clear members after delete community ${id}`);
      await writeJsonFile(FILE_COMMUNITIES, communities, csha);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, removed, affectedMembers: members.length }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('[communities] FATAL:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
