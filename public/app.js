const $ = (s) => document.querySelector(s);
let CONFIG = null;

async function loadConfig() {
  try {
    CONFIG = await (await fetch('/api/config')).json();
    const cards = $('#tier-cards');
    const desc = {
      light: '간단한 비교·검증. 핵심만 빠르게.',
      standard: '시장·경쟁사 분석 수준. 가장 인기.',
      deep: '의사결정용 심층 조사 + 권고안.',
    };
    cards.innerHTML = Object.entries(CONFIG.tiers)
      .map(([key, t]) => `
        <div class="card">
          ${key === 'standard' ? '<span class="tag">인기</span> ' : ''}<span class="tag sale">런칭 50%</span>
          <h3>${t.label}</h3>
          <div class="price">₩${t.krw.toLocaleString()} <small><s>₩${t.krwOrig.toLocaleString()}</s> / $${t.usd} USDC</small></div>
          <p>${desc[key]}</p>
          <p>${t.pages} · ${t.hours}시간 내 발송</p>
        </div>`)
      .join('');
  } catch {
    /* 서버 미기동 시 무시 */
  }
}

$('#order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button');
  btn.disabled = true;
  const body = Object.fromEntries(new FormData(form).entries());
  const box = $('#order-result');
  box.hidden = false;
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '접수에 실패했습니다.');
    const t = CONFIG?.tiers?.[body.tier];
    const payLines = [];
    if (body.payMethod === 'toss' && CONFIG?.pay?.tossId) payLines.push(`토스 아이디 <strong>${CONFIG.pay.tossId}</strong>로 ₩${t.krw.toLocaleString()} 송금`);
    if (body.payMethod === 'paypal' && CONFIG?.pay?.paypalMe) payLines.push(`<a href="https://paypal.me/${CONFIG.pay.paypalMe}/${t.usd}" target="_blank" rel="noopener">PayPal로 $${t.usd} 결제하기</a>`);
    if (body.payMethod === 'usdc' && CONFIG?.pay?.usdcAddress) payLines.push(`USDC(${CONFIG.pay.usdcChain}) <strong>$${t.usd}</strong> → <code>${CONFIG.pay.usdcAddress}</code>`);
    if (payLines.length === 0) payLines.push('결제 안내를 이메일로 보내드립니다.');
    box.innerHTML = `
      <p>✅ 접수 완료! 주문번호: <span class="oid">${data.id}</span></p>
      <p>결제가 확인되면 에이전트가 조사를 시작하고, 완료되면 이메일로 리포트를 보내드립니다.</p>
      <p>${payLines.join('<br>')}</p>
      <p>아래 '주문 조회'에서 진행상황을 볼 수 있어요.</p>`;
    form.reset();
  } catch (err) {
    box.innerHTML = `<p class="err">⚠️ ${err.message}</p>`;
  } finally {
    btn.disabled = false;
  }
});

$('#status-btn').addEventListener('click', async () => {
  const id = $('#status-id').value.trim();
  const box = $('#status-result');
  if (!id) return;
  box.hidden = false;
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '조회 실패');
    const statusKo = {
      awaiting_payment: '입금 대기 중',
      paid: '결제 확인 — 곧 시작',
      running: '조사 진행 중',
      done: '완료',
      failed: '오류 — 문의해 주세요',
    };
    box.innerHTML = `
      <p><strong>${data.topic}</strong></p>
      <p>상태: <strong>${statusKo[data.status] || data.status}</strong></p>
      ${data.progress.map((p) => `<p>· ${p.message}</p>`).join('')}
      ${data.reportPath ? `<p><a href="${data.reportPath}" target="_blank" rel="noopener"><strong>📄 리포트 열기</strong></a></p>` : ''}`;
  } catch (err) {
    box.innerHTML = `<p class="err">⚠️ ${err.message}</p>`;
  }
});

loadConfig();
