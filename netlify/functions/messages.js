const { getStore } = require('@netlify/blobs');

const getMessagesStore = () => {
  const options = {};
  if (process.env.NETLIFY_SITE_ID) options.siteID = process.env.NETLIFY_SITE_ID;
  if (process.env.NETLIFY_TOKEN) options.token = process.env.NETLIFY_TOKEN;
  return getStore('messages', options);
};

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-cengfan-2024';

const verifyAdmin = (event) => {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
};

exports.handler = async (event) => {
  const store = getMessagesStore();

  try {
    if (event.httpMethod === 'GET') {
      let data;
      try {
        data = await store.get('messages', { type: 'json' });
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
        list = await store.get('messages', { type: 'json' }) || [];
      } catch (e) {
        list = [];
      }
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const newItem = {
        id: Date.now(),
        content: body.content,
        created_at: timeStr
      };
      list.push(newItem);
      await store.setJSON('messages', list);
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
      let list = await store.get('messages', { type: 'json' }) || [];
      const idx = list.findIndex(m => m.id == id);
      if (idx === -1) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Not found' })
        };
      }
      list.splice(idx, 1);
      await store.setJSON('messages', list);
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
