const admin = require('firebase-admin');

// Firebase инициализация через env переменные
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
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  const event = req.body;
  console.log('[webhook] event type:', event?.event);

  // Отвечаем сразу чтобы ЮКасса не повторяла запрос
  res.status(200).send('ok');

  if (event?.event !== 'payment.succeeded') return;

  const payment = event.object;
  const { uid, plan } = payment?.metadata || {};

  if (!uid || !plan) {
    console.warn('[webhook] Missing metadata:', payment?.id);
    return;
  }

  try {
    // Сохраняем платёж
    await db.collection('payments').doc(payment.id).set({
      uid, plan,
      paymentId: payment.id,
      status: 'succeeded',
      amount: payment.amount?.value,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Считаем дату окончания +30 дней
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    const expiresAtStr = expiresAt.toISOString();

    // Активируем план в профиле пользователя
    await db.collection('users').doc(uid).set({
      plan,
      planExpiresAt: expiresAtStr,
      planPaymentId: payment.id,
      planActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Активируем план в space пользователя
    const spacesSnap = await db.collection('spaces')
      .where('memberIds', 'array-contains', uid)
      .limit(1)
      .get();

    if (!spacesSnap.empty) {
      await spacesSnap.docs[0].ref.update({
        plan,
        planUid: uid,
        planExpiresAt: expiresAtStr,
        planActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`[webhook] ✓ Plan ${plan} activated for ${uid}, expires ${expiresAtStr}`);
  } catch (e) {
    console.error('[webhook] Error activating plan:', e);
  }
};
