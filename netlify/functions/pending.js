const https = require('https');

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';
const PENDING_BIN_ID = process.env.PENDING_BIN_ID || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';

console.log('[pending] ENV check:');
console.log('  JSONBIN_API_KEY:', JSONBIN_API_KEY ? 'SET (' + JSONBIN_API_KEY.substring(0, 10) + '...)' : 'MISSING');
console.log('  PENDING_BIN_ID:', PENDING_BIN_ID || 'MISSING');
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

const readPending = async () => {
  const res = await jsonbinRequest('GET', PENDING_BIN_ID);
  console.log('[readPending] status:', res.status, 'hasRecord:', !!(res.data && res.data.record));
  if (res.status === 200 && res.data && res.data.record) {
    return res.data.record;
  }
  return [];
};

const writePending = async (list) => {
  console.log('[writePending] Writing', list.length, 'items');
  const res = await jsonbinRequest('PUT', PENDING_BIN_ID, list);
  console.log('[writePending] PUT status:', res.status);
  if (res.status !== 200) {
    console.error('[writePending] FAILED! Full response:', JSON.stringify(res.data || res.raw));
    throw new Error(`Write failed with status ${res.status}: ${JSON.stringify(res.data || res.raw)}`);
  }
  console.log('[writePending] Success');
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

    if (!JSONBIN_API_KEY || !PENDING_BIN_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'JSONBin not configured', key: !!JSONBIN_API_KEY, bin: !!PENDING_BIN_ID })
      };
    }

    if (event.httpMethod === 'GET') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const list = await readPending();
      return { statusCode: 200, headers, body: JSON.stringify(list) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      console.log('[POST] New pending app:', body.nickname, body.province);
      const list = await readPending();
      body.id = Date.now();
      list.push(body);
      await writePending(list);
      return { statusCode: 200, headers, body: JSON.stringify(body) };
    }

    if (event.httpMethod === 'DELETE') {
      if (!verifyAdmin(event)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const id = event.path.split('/').pop();
      console.log('[DELETE] id:', id);
      const list = await readPending();
      const idx = list.findIndex(p => p.id == id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      list.splice(idx, 1);
      await writePending(list);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('[pending] FATAL Error:', error.message);
    console.error(error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
