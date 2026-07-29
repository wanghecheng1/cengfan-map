const https = require('https');

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';
const STUDENTS_BIN_ID = process.env.STUDENTS_BIN_ID || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';

console.log('[students] ENV check:');
console.log('  JSONBIN_API_KEY:', JSONBIN_API_KEY ? 'SET (' + JSONBIN_API_KEY.substring(0, 10) + '...)' : 'MISSING');
console.log('  STUDENTS_BIN_ID:', STUDENTS_BIN_ID || 'MISSING');
console.log('  ADMIN_TOKEN:', ADMIN_TOKEN ? 'SET' : 'MISSING');

const verifyAdmin = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
};

const jsonbinRequest = (method, binId, body = null) => {
  return new Promise((resolve, reject) => {
    const path = body ? `/v3/b/${binId}` : `/v3/b/${binId}/latest`;
    console.log(`[jsonbin] ${method} https://api.jsonbin.io${path}`);
    const options = {
      hostname: 'api.jsonbin.io',
      path: path,
      method: method,
      headers: {
        'X-Access-Key': JSONBIN_API_KEY,
        'Content-Type': 'application/json',
        'X-Bin-Versioning': 'false'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`[jsonbin] Response status: ${res.statusCode}`);
        console.log(`[jsonbin] Response body (first 500 chars): ${data.substring(0, 500)}`);
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    });

    req.on('error', (e) => {
      console.error('[jsonbin] Network error:', e.message);
      reject(e);
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

const readStudents = async () => {
  const res = await jsonbinRequest('GET', STUDENTS_BIN_ID);
  console.log('[readStudents] status:', res.status, 'hasRecord:', !!(res.data && res.data.record));
  if (res.status === 200 && res.data && res.data.record) {
    return res.data.record;
  }
  return [];
};

const writeStudents = async (list) => {
  console.log('[writeStudents] Writing', list.length, 'items');
  const res = await jsonbinRequest('PUT', STUDENTS_BIN_ID, list);
  console.log('[writeStudents] PUT status:', res.status);
  if (res.status !== 200) {
    console.error('[writeStudents] FAILED! Full response:', JSON.stringify(res.data || res.raw));
    throw new Error(`Write failed with status ${res.status}: ${JSON.stringify(res.data || res.raw)}`);
  }
  console.log('[writeStudents] Success');
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
        body: JSON.stringify({ error: 'JSONBin not configured', key: !!JSONBIN_API_KEY, bin: !!STUDENTS_BIN_ID })
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
      console.log('[POST] New student:', body.nickname, body.province);
      const list = await readStudents();
      body.id = Date.now();
      list.push(body);
      await writeStudents(list);
      return { statusCode: 200, headers, body: JSON.stringify(body) };
    }

    if (event.httpMethod === 'PUT') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      const body = JSON.parse(event.body);
      console.log('[PUT] id:', id);
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
      console.log('[DELETE] id:', id);
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
    console.error('[students] FATAL Error:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
