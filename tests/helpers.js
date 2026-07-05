// Shared test helpers for mocking the Google Apps Script backend.

// Build a token the client will accept: it only reads the payload (user, role,
// exp) and checks expiry — the signature is never verified client-side, so a
// placeholder signature is fine for tests.
function makeToken(user, role, ttlMs = 3600000) {
  const payload = Buffer.from(JSON.stringify({ u: user, r: role, exp: Date.now() + ttlMs }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return payload + '.testsig';
}

const CREDS = {
  Aditya:   { pass: 'Admin0604', role: 'admin' },
  Priyanka: { pass: 'Admin3001', role: 'staff' },
};

// Route all Apps Script traffic to canned responses: a working login,
// order/customer/matrix reads, and an ack for writes.
async function mockBackend(page, orders = []) {
  await page.route('**script.google.com**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'POST') {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (e) { /* ignore */ }
      if (body.action === 'login') {
        const c = CREDS[body.user];
        if (c && c.pass === body.pass) {
          return route.fulfill({ contentType: 'application/json',
            body: JSON.stringify({ status: 'success', token: makeToken(body.user, c.role), user: body.user, role: c.role }) });
        }
        return route.fulfill({ contentType: 'application/json',
          body: JSON.stringify({ status: 'error', message: 'Invalid username or password' }) });
      }
      // Bill-log / uploadProof writes — just acknowledge.
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success' }) });
    }

    if (url.includes('action=orders')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', orders }) });
    }
    if (url.includes('action=matrix')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', matrix: {}, ingredients: [] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', customers: [] }) });
  });
}

async function login(page, user) {
  const pass = CREDS[user].pass;
  await page.fill('#loginUser', user);
  await page.fill('#loginPass', pass);
  await page.click('#loginBtn');
}

module.exports = { makeToken, mockBackend, login, CREDS };
