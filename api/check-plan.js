const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { uid } = req.body?.data || req.body || {};
  if (!uid) { res.status(400).json({ error: 'Missing uid' }); return; }

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.plan || userData.plan === 'free') {
      res.status(200).json({ result: { plan: 'free' } });
      return;
    }

    // Проверяем не истёк ли план
    if (userData.planExpiresAt) {
      const expires = new Date(userData.planExpiresAt);
      if (expires < new Date()) {
        await db.collection('users').doc(uid).update({ plan: 'free' });
        res.status(200).json({ result: { plan: 'free', expired: true } });
        return;
      }
    }

    res.status(200).json({
      result: { plan: userData.plan, expiresAt: userData.planExpiresAt }
    });
  } catch (e) {
    console.error('[check-plan]', e);
    res.status(200).json({ result: { plan: 'free' } });
  }
};
