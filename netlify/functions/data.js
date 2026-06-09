const REPO = 'piyushbajpaidubai/myfamilytravelapp';
const FILE_PATH = 'public/traveldata.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const ghHeaders = {
    'Authorization': 'token ' + GITHUB_TOKEN,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'GET') {
    const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + FILE_PATH, {
      headers: ghHeaders
    });
    const fileInfo = await r.json();
    const decoded = Buffer.from(fileInfo.content, 'base64').toString('utf8');
    const data = JSON.parse(decoded);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (event.httpMethod === 'POST') {
    const { trips } = JSON.parse(event.body);

    const fileRes = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + FILE_PATH, {
      headers: ghHeaders
    });
    const fileData = await fileRes.json();
    const sha = fileData.sha;

    const content = Buffer.from(JSON.stringify({ trips }, null, 2)).toString('base64');
    const updateRes = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + FILE_PATH, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify({
        message: 'Update travel data',
        content,
        sha
      })
    });
    const result = await updateRes.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, sha: result.content ? result.content.sha : null })
    };
  }

  return { statusCode: 405, headers, body: 'Method not allowed' };
};
