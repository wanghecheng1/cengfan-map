// V4 唐榜功能：GET /api/tang-rank + POST /api/tang-rank/vote
// 2026-07-30 新增
const crypto = require('crypto');
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

const STUDENT_SALT = process.env.STUDENT_TOKEN_SALT || 'cengfan-student-salt-2024';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-Student-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const githubApi = async (path, opts = {}) => {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    throw new Error('GITHUB_TOKEN / GITHUB_REPO 环境变量未配置');
  }
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'cengfan-map',
      ...(opts.headers || {}),
    },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`GitHub API ${res.status}: ${(data && data.message) || text.slice(0, 200)}`);
  }
  return data;
};

const readJson = async (filePath) => {
  const data = await githubApi(filePath);
  if (!data) return null;
  const content = Buffer.from(data.content || '', 'base64').toString('utf8');
  let parsed = null;
  try { parsed = JSON.parse(content || 'null'); } catch (e) { parsed = null; }
  return { data: parsed, sha: data.sha };
};

const writeJson = async (filePath, obj, message = 'update') => {
  let sha = null;
  try {
    const existing = await githubApi(filePath);
    if (existing && existing.sha) sha = existing.sha;
  } catch (e) { /* ignore */ }
  const content = Buffer.from(JSON.stringify(obj, null, 2)).toString('base64');
  return githubApi(filePath, {
    method: 'PUT',
    body: JSON.stringify({ message: `[V4 tang-rank] ${message}`, content, sha }),
  });
};

const parseStudentToken = (token, students) => {
  if (!token || typeof token !== 'string' || !students) return null;
  const [b64, sign] = token.split('.');
  if (!b64 || !sign) return null;
  let payload = null;
  try { payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); } catch (e) { return null; }
  if (!payload || !payload.id || !payload.createdAt) return null;
  if (md5(JSON.stringify(payload) + STUDENT_SALT) !== sign) return null;
  if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
  const s = students.find(x => String(x.id) === String(payload.id));
  if (!s) return null;
  if (String(s.password || '').slice(-4) !== (payload.passTail || '')) return null;
  return s;
};

const todayStr = () => {
  // 北京时间 0 点重置
  return new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const method = event.httpMethod;
  const path = event.path || '';
  try {
    // 读 students（用于查找 nickname / communityId）
    const studentsRaw = await readJson('data/students.json');
    const students = (studentsRaw && studentsRaw.data) || [];
    // 读 communities（用于查找 communityName）
    const commsRaw = await readJson('data/communities.json');
    const communities = (commsRaw && commsRaw.data) || [];

    // 解析 X-Student-Token（可选）
    const headerToken = event.headers['x-student-token'] || event.headers['X-Student-Token'];
    const fromStudent = headerToken ? parseStudentToken(String(headerToken), students) : null;

    // ============ GET /api/tang-rank：拉榜 + 剩余票数 ============
    if (method === 'GET' && !path.endsWith('/vote')) {
      // 1) 读 tang-rank.json，不存在则初始化
      let rankRaw = await readJson('data/tang-rank.json');
      let rankData = (rankRaw && rankRaw.data) || null;
      if (!rankData || typeof rankData !== 'object') {
        rankData = { dailyVotes: {}, totalVotes: {}, votes: [] };
      }
      const totalVotes = rankData.totalVotes || {};
      const dailyVotes = rankData.dailyVotes || {};
      const today = todayStr();

      // 2) 构建榜单：已在社区的同学，总票 >= 1 才显示
      const rankedList = students
        .filter(s => s && s.communityId)
        .map(s => {
          const community = communities.find(c => String(c.id) === String(s.communityId));
          return {
            studentId: s.id,
            nickname: s.nickname || String(s.id),
            communityId: s.communityId || null,
            communityName: community ? community.name : '未入社',
            total: parseInt(totalVotes[String(s.id)] || '0', 10),
          };
        })
        .filter(r => r.total > 0)
        .sort((a, b) => b.total - a.total)
        .map((r, idx) => ({ ...r, rank: idx + 1 }));

      // 3) 计算当前用户剩余票数
      let myRemaining = 0;
      let myVotedToday = [];
      if (fromStudent && fromStudent.communityId) {
        const used = parseInt((dailyVotes[today] && dailyVotes[today][String(fromStudent.id)]) || '0', 10);
        myRemaining = Math.max(0, 3 - used);
        if (rankData.votes && Array.isArray(rankData.votes)) {
          myVotedToday = rankData.votes
            .filter(v => v && String(v.voterId) === String(fromStudent.id) && v.date === today)
            .map(v => v.candidateId);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ rank: rankedList, myRemaining, myVotedToday })
      };
    }

    // ============ POST /api/tang-rank/vote：投票 ============
    if (method === 'POST' && path.endsWith('/vote')) {
      if (!fromStudent) return { statusCode: 401, headers, body: JSON.stringify({ error: '请先使用同学身份登录（Token 无效或缺失）' }) };
      if (!fromStudent.communityId) return { statusCode: 403, headers, body: JSON.stringify({ error: '仅已加入社区的同学可参与投票' }) };

      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
      const candidateId = body.candidateId !== undefined ? Number(body.candidateId) : null;
      if (!candidateId || Number.isNaN(candidateId)) return { statusCode: 400, headers, body: JSON.stringify({ error: '请选择要投票的同学（candidateId 无效）' }) };

      const candidate = students.find(s => String(s.id) === String(candidateId));
      if (!candidate) return { statusCode: 400, headers, body: JSON.stringify({ error: '候选人档案不存在' }) };
      if (!candidate.communityId) return { statusCode: 403, headers, body: JSON.stringify({ error: '候选人尚未加入社区，暂不上榜' }) };
      if (String(fromStudent.id) === String(candidateId)) return { statusCode: 400, headers, body: JSON.stringify({ error: '不能投给自己哦' }) };

      // 读 tang-rank.json
      let rankRaw = await readJson('data/tang-rank.json');
      let rankData = (rankRaw && rankRaw.data) || null;
      if (!rankData || typeof rankData !== 'object') {
        rankData = { dailyVotes: {}, totalVotes: {}, votes: [] };
      }
      if (!rankData.dailyVotes) rankData.dailyVotes = {};
      if (!rankData.totalVotes) rankData.totalVotes = {};
      if (!Array.isArray(rankData.votes)) rankData.votes = [];

      const today = todayStr();
      if (!rankData.dailyVotes[today]) rankData.dailyVotes[today] = {};
      const todayBucket = rankData.dailyVotes[today];
      const voterKey = String(fromStudent.id);
      const used = parseInt(todayBucket[voterKey] || '0', 10);
      if (used >= 3) return { statusCode: 429, headers, body: JSON.stringify({ error: '今日 3 票已用完，明天 0 点再来～' }) };

      // 检查重复投票给同一人 3 次（无限制也可以，这里保留允许多次给同一人）
      todayBucket[voterKey] = used + 1;
      const candKey = String(candidateId);
      rankData.totalVotes[candKey] = parseInt(rankData.totalVotes[candKey] || '0', 10) + 1;
      rankData.votes.push({
        id: (rankData.votes.length ? rankData.votes[rankData.votes.length - 1].id : 0) + 1,
        voterId: fromStudent.id,
        candidateId: candidateId,
        date: today,
        createdAt: Date.now(),
      });
      // 投票流水剪枝：只保留最近 5000 条
      if (rankData.votes.length > 5000) rankData.votes = rankData.votes.slice(-5000);

      // 写回 GitHub
      await writeJson('data/tang-rank.json', rankData, `vote ${fromStudent.id}→${candidateId}`);
      const newTotal = rankData.totalVotes[candKey];
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          remaining: Math.max(0, 3 - todayBucket[voterKey]),
          candidateId: candidateId,
          newTotal: newTotal,
        })
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: `路径未匹配 ${method} ${path}` }) };
  } catch (err) {
    console.error('[tang-rank] handler error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err && err.message ? err.message : String(err) }) };
  }
};
