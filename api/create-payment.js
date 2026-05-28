const axios = require('axios');

const SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const SECRET  = process.env.YOOKASSA_SECRET;

const PLANS = {
  duo:  { amount: '129.00', label: 'PathTogether — план «Пара»' },
  team: { amount: '299.00', label: 'PathTogether — план «Команда»' },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { uid, plan } = req.body?.data || req.body || {};

  if (!uid || !plan || !PLANS[plan]) {
    res.status(400).json({ error: 'Missing uid or plan' });
    return;
  }

  try {
    const response = await axios.post(
      'https://api.yookassa.ru/v3/payments',
      {
        amount: { value: PLANS[plan].amount, currency: 'RUB' },
        confirmation: {
          type: 'redirect',
          return_url: 'pathtogether://payment-result',
        },
        capture: true,
        description: PLANS[plan].label,
        metadata: { uid, plan },
      },
      {
        auth: { username: SHOP_ID, password: SECRET },
        headers: {
          'Idempotence-Key': `${uid}_${plan}_${Date.now()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const payment = response.data;
    res.status(200).json({
      result: {
        paymentId: payment.id,
        confirmationUrl: payment.confirmation.confirmation_url,
      }
    });
  } catch (e) {
    console.error('[create-payment]', e?.response?.data || e.message);
    res.status(500).json({ error: 'Payment creation failed' });
  }
};
