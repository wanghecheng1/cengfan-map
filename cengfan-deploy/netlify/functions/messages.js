const https = require('https');

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';
const MESSAGES_BIN_ID = process.env.MESSAGES_BIN_ID || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';

const verifyAdmin = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
};

const jsonbinRequest = (method, binId, body = null) => {
  return new Promise((resolve, reject) => {
    const path = body ? `/v3/b/${binId}` : `/v3/b/${binId}/latest`;
    const options = {
      hostname: 'api.jsonbin.io',
      path: path,
      method: method,
      headers: {
        'X-Access-Key': JSONBIN_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

const readMessages = async () => {
  const res = await jsonbinRequest('GET', MESSAGES_BIN_ID);
  if (res.status === 200 && res.data && res.data.record) {
    return res.data.record;
  }
  return [];
};

const writeMessages = async (list) => {
  await jsonbinRequest('PUT', MESSAGES_BIN_ID, list);
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (!JSONBIN_API_KEY || !MESSAGES_BIN_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'JSONBin not configured' })
      };
    }

    if (event.httpMethod === 'GET') {
      const list = await readMessages();
      return { statusCode: 200, headers, body: JSON.stringify(list) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const list = await readMessages();
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const newItem = {
        id: Date.now(),
        content: body.content,
        created_at: timeStr
      };
      list.push(newItem);
      await writeMessages(list);
      return { statusCode: 200, headers, body: JSON.stringify(newItem) };
    }

    if (event.httpMethod === 'DELETE') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      const list = await readMessages();
      const idx = list.findIndex(m => m.id == id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      list.splice(idx, 1);
      await writeMessages(list);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
