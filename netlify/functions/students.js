const https = require('https');

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';
const STUDENTS_BIN_ID = process.env.STUDENTS_BIN_ID || '';
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

const readStudents = async () => {
  const res = await jsonbinRequest('GET', STUDENTS_BIN_ID);
  if (res.status === 200 && res.data && res.data.record) {
    return res.data.record;
  }
  return [];
};

const writeStudents = async (list) => {
  await jsonbinRequest('PUT', STUDENTS_BIN_ID, list);
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (!JSONBIN_API_KEY || !STUDENTS_BIN_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'JSONBin not configured' })
      };
    }

    if (event.httpMethod === 'GET') {
      const list = await readStudents();
      return { statusCode: 200, headers, body: JSON.stringify(list) };
    }

    if (event.httpMethod === 'POST') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const body = JSON.parse(event.body);
      const list = await readStudents();
      const newItem = {
        id: Date.now(),
        ...body,
        created_at: new Date().toLocaleDateString('zh-CN')
      };
      list.push(newItem);
      await writeStudents(list);
      return { statusCode: 200, headers, body: JSON.stringify(newItem) };
    }

    if (event.httpMethod === 'PUT') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      const body = JSON.parse(event.body);
      const list = await readStudents();
      const idx = list.findIndex(s => s.id == id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      list[idx] = { ...list[idx], ...body };
      await writeStudents(list);
      return { statusCode: 200, headers, body: JSON.stringify(list[idx]) };
    }

    if (event.httpMethod === 'DELETE') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      const list = await readStudents();
      const idx = list.findIndex(s => s.id == id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      list.splice(idx, 1);
      await writeStudents(list);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
