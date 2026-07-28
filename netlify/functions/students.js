const { getStore } = require('@netlify/blobs');

const getStudentsStore = () => {
  const options = {};
  if (process.env.NETLIFY_SITE_ID) options.siteID = process.env.NETLIFY_SITE_ID;
  if (process.env.NETLIFY_TOKEN) options.token = process.env.NETLIFY_TOKEN;
  return getStore('students', options);
};

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';

const verifyAdmin = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
};

exports.handler = async (event) => {
  const store = getStudentsStore();

  try {
    if (event.httpMethod === 'GET') {
      let data;
      try {
        data = await store.get('students', { type: 'json' });
      } catch (e) {
        data = [];
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data || [])
      };
    }

    if (event.httpMethod === 'POST') {
      if (!verifyAdmin(event)) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }
      const body = JSON.parse(event.body);
      let list;
      try {
        list = await store.get('students', { type: 'json' }) || [];
      } catch (e) {
        list = [];
      }
      const newItem = {
        id: Date.now(),
        ...body,
        created_at: new Date().toLocaleDateString('zh-CN')
      };
      list.push(newItem);
      await store.setJSON('students', list);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(newItem)
      };
    }

    if (event.httpMethod === 'PUT') {
      if (!verifyAdmin(event)) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }
      const id = event.path.split('/').pop();
      const body = JSON.parse(event.body);
      let list = await store.get('students', { type: 'json' }) || [];
      const idx = list.findIndex(s => s.id == id);
      if (idx === -1) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Not found' })
        };
      }
      list[idx] = { ...list[idx], ...body };
      await store.setJSON('students', list);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(list[idx])
      };
    }

    if (event.httpMethod === 'DELETE') {
      if (!verifyAdmin(event)) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }
      const id = event.path.split('/').pop();
      let list = await store.get('students', { type: 'json' }) || [];
      const idx = list.findIndex(s => s.id == id);
      if (idx === -1) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Not found' })
        };
      }
      list.splice(idx, 1);
      await store.setJSON('students', list);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: true })
      };
    }

    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: ''
      };
    }

    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
