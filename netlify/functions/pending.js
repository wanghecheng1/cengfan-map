const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const FILE_PATH = 'data/pending.json';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';

// 东八区时间格式化（不管服务器时区，强制 Asia/Shanghai）
const toBeijingTime = (date = new Date()) => {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(date).replace(/\//g, '-');
};

console.log('[pending-github] ENV check:');
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
    message: `Update pending.json at ${new Date().toISOString()}`,
    content: content,
    sha: sha
  };
  const res = await githubRequest('PUT', GITHUB_REPO, FILE_PATH, body);
  if (res.status === 200 || res.status === 201) {
    console.log('[writeFile] Success');
    return;
  }
  console.error('[writeFile] FAILED:', res.status, JSON.stringify(res.data || res.raw));
  throw new Error(`Failed to write file: status ${res.status}`);
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
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const { list } = await getFileContent();
      return { statusCode: 200, headers, body: JSON.stringify(list) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      console.log('[POST] New pending app:', body.nickname, body.province);
      const { list, sha } = await getFileContent();
      const newItem = {
        id: Date.now(),
        created_at: toBeijingTime(),
        ...body,
        hobbies: body.hobbies || [],
        looking_for_food: body.looking_for_food || false,
        wechat: body.wechat || '',
        qq: body.qq || ''
      };
      list.push(newItem);
      await writeFileContent(list, sha);
      return { statusCode: 200, headers, body: JSON.stringify(newItem) };
    }

    if (event.httpMethod === 'DELETE') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      console.log('[DELETE] id:', id);
      const { list, sha } = await getFileContent();
      const idx = list.findIndex(p => p.id == id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      list.splice(idx, 1);
      await writeFileContent(list, sha);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('[pending] FATAL:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
