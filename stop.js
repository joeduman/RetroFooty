const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const statePath = path.join(__dirname, '.retrofooty-server.json');
function request(port, route, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method: token ? 'POST' : 'GET',
      headers: token ? { Authorization: 'Bearer ' + token } : {}, timeout: 2500 }, res => {
      let body = ''; res.on('data', chunk => body += chunk);
      res.on('end', () => res.statusCode === 200 ? resolve(body) : reject(new Error('Stop request rejected: ' + res.statusCode)));
    });
    req.on('timeout', () => req.destroy(new Error('The server did not respond.')));req.on('error', reject);req.end();
  });
}
(async () => {
  if (!fs.existsSync(statePath)) {
    console.log('No RetroFooty session was started from this folder.');
    return;
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  let live;
  try { live = JSON.parse(await request(state.port, '/_teamball/health')); }
  catch (error) {
    if (error.code === 'ECONNREFUSED') { console.log('This RetroFooty session is already stopped.'); fs.unlinkSync(statePath); return; }
    throw error;
  }
  if (live.app !== 'teamball' || live.root !== __dirname || live.pid !== state.pid) {
    throw new Error('The port belongs to another session. Nothing was stopped. Run STOP-RETROFOOTY.cmd from the running copy’s folder.');
  }
  console.log(await request(state.port, '/_teamball/stop', state.token));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
