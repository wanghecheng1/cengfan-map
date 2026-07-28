const { getStore } = require('@netlify/blobs');

const getPendingStore = () => getStore('pending');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';

const verifyAdmin = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
};

exports.handler = async (event) => {
  const store = getPendingStore();

  try {
    if (event.httpMethod === 'GET') {
      if (!verifyAdmin(event)) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }
      let data;
      try {
        data = await store.get('pending', { type: 'json' });
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
      const body = JSON.parse(event.body);
      let list;
      try {
        list = await store.get('pending', { type: 'json' }) || [];
      } catch (e) {
        list = [];
      }
      const newItem = {
        id: Date.now(),
        ...body,
        created_at: new Date().toLocaleDateString('zh-CN')
      };
      list.push(newItem);
      await store.setJSON('pending', list);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(newItem)
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
      let list = await store.get('pending', { type: 'json' }) || [];
      const idx = list.findIndex(s => s.id == id);
      if (idx === -1) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Not found' })
        };
      }
      const removed = list.splice(idx, 1)[0];
      await store.setJSON('pending', list);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(removed)
      };
    }

    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
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
