async function handleRequest(request, env) {
  const { pathname } = new URL(request.url);
  const [_, token, next, ...params] = pathname.split('/');

  if (/^v\d+$/.test(token)) {
    return proxy(request, env);
  } else if (token === env.ACCESS_TOKEN) {
    console.log('Accessing master handler');
    var result;
    if (request.method === 'DELETE') {
      await deleteUser(next, env);
      result = 'ok';
    } else if (next === 'register' || next === 'reset') {
      result = await registerUser(params[0], env);
    }

    if (!result) throw 'Invalid action';
    return new Response(`${result}\n`, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  throw 'Access forbidden';
}

async function proxy(request, env) {
  const headers = new Headers(request.headers);
  const authKey = 'Authorization';
  const token = headers.get(authKey).split(' ').pop();
  if (!token) throw 'Auth required';

  // validate user
  const users = await env.KV.get("users", { type: 'json' }) || {};
  let name;
  for (let key in users)
    if (users[key].key === token)
      name = key;

  if (!name) throw 'Invalid token';
  console.log(`User ${name} acepted.`);

  // proxy the request
  const url = new URL(request.url);
  // 1. replace with the official host
  url.host = 'api.openai.com';
  // 2. replace with the real API key
  headers.set(authKey, `Bearer ${env.OPENAPI_API_KEY}`);
  // 3. issue the underlying request
  return fetch(url, {
    method: request.method,
    headers: headers,
    body: JSON.stringify(await request.json()),
  });
}

async function registerUser(user, env) {
  if (!user?.length) throw 'Invalid username1';

  const users = await env.KV.get("users", { type: 'json' }) || {};
  const key = generateAPIKey();
  users[user] = { key };
  await env.KV.put("users", JSON.stringify(users));
  return key;
}

async function deleteUser(user, env) {
  if (!user?.length) throw 'Invalid username2';

  const users = await env.KV.get("users", { type: 'json' }) || {};
  if (!users[user]) throw 'User not found';

  delete users[user];
  await env.KV.put("users", JSON.stringify(users));
}

function generateAPIKey() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let apiKey = 'sk-cfw';

  for (let i = 0; i < 45; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    apiKey += characters.charAt(randomIndex);
  }

  return apiKey;
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env).catch(err => new Response(err || 'Unknown reason', { status: 403 }))
  }
};
