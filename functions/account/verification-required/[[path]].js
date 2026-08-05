function page(origin) {
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#0b1425">
  <title>Verification required · Sousa Murray Planeia</title>
  <style>
    :root{font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#f8fafc;background:#08111f}*{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 65% 15%,rgba(37,99,235,.18),transparent 34%),#08111f}
    main{width:min(620px,100%);padding:36px;border:1px solid #263955;border-radius:20px;background:#0d1a2e;box-shadow:0 24px 70px rgba(0,0,0,.35)}
    .brand{display:flex;align-items:center;margin-bottom:30px}.brand span{color:#9fb0ca;font-size:12px}
    .eyebrow{margin:0 0 8px;color:#84adff;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:0 0 14px;font-size:34px;line-height:1.1}p{color:#b9c6d9;line-height:1.65}
    .notice{margin:24px 0;padding:15px 16px;border-left:3px solid #5b8def;background:#0a1729}.notice strong{display:block;margin-bottom:5px;color:#fff}.notice span{color:#b9c6d9;line-height:1.5}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:750}.primary{background:#2563eb;color:#fff}.secondary{border:1px solid #40516a;color:#e5edf8}
    small{display:block;margin-top:24px;color:#7f8ea5;line-height:1.5}
  </style>
</head>
<body>
  <main>
    <div class="brand"><div><strong>Sousa Murray Planeia</strong><span>JA Group Services Ltd customer protection</span></div></div>
    <p class="eyebrow">Age assurance</p>
    <h1>Confirm that you are 16 or over</h1>
    <p>Head Office controls the age requirement for Sousa Murray Planeia customer accounts. This process does not apply to staff accounts.</p>
    <div class="notice"><strong>Verification must be authorised</strong><span>Only a current Head Office step-up decision and the signed verification result can approve access.</span></div>
    <div class="actions">
      <a class="primary" href="${origin}/sign-in">Return to sign in</a>
      <a class="secondary" href="${origin}/contact">Contact customer support</a>
    </div>
    <small>No confidential security or investigation information is displayed on this page.</small>
  </main>
</body>
</html>`;
}

export const onRequest = async ({ request }) => {
  const origin = new URL(request.url).origin;
  return new Response(page(origin), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
};
