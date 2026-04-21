// ─────────────────────────────────────────────────────────────
// PrintForge13 – Vercel Serverless Function : Stripe Checkout
// Fichier : api/checkout.js
//
// SETUP :
//   1. Vercel → Settings → Environment Variables
//      STRIPE_SECRET_KEY = sk_live_xxxxxxxxxxxxxxxx
//   2. npm install stripe
//
// ⚠️  PRIX MAÎTRE — modifier ici ET dans medal-rack.html (UNIT_PRICE)
//     ET dans index.html (price:)
// ─────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ── Catalogue produits ────────────────────────────────────────
const PRODUCTS = {
  'medal-rack': {
    name: 'Porte-Médailles Sport – PrintForge13',
    description: 'Support mural impression 3D pour médailles trail, course, CrossFit, Hyrox. Imprimé à la commande à Marseille.',
    unit_amount: 1490, // ⚠️ 14,90 € en centimes
    currency: 'eur',
    images: ['https://printforge13.vercel.app/images/medal-rack-1.jpg'],
  },
};

// ── Seuil livraison offerte ───────────────────────────────────
const FREE_SHIPPING_THRESHOLD = 5000; // 50,00 € en centimes

// ── Handler ──────────────────────────────────────────────────
module.exports = async (req, res) => {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Panier vide ou invalide.' });
    }

    const line_items = [];

    for (const item of items) {
      const { productId, color, qty, quantity } = item;
      const finalQty = qty || quantity || 1;
      const product = PRODUCTS[productId];

      if (!product) return res.status(400).json({ error: `Produit inconnu : ${productId}` });
      if (finalQty < 1 || finalQty > 99) return res.status(400).json({ error: `Quantité invalide` });

      line_items.push({
        quantity: finalQty,
        price_data: {
          currency: product.currency,
          unit_amount: product.unit_amount,
          product_data: {
            name: color ? `${product.name} – ${color}` : product.name,
            description: color ? `${product.description}\nCouleur : ${color}` : product.description,
            images: product.images,
          },
        },
      });
    }

    const orderTotal = line_items.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
    const freeShipping = orderTotal >= FREE_SHIPPING_THRESHOLD;

    const shipping_options = [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: freeShipping ? 0 : 490, currency: 'eur' },
          display_name: freeShipping ? '🎉 Livraison offerte (commande ≥ 50 €)' : 'Colissimo Suivi',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 5 },
            maximum: { unit: 'business_day', value: 10 },
          },
        },
      },
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'eur' },
          display_name: 'Retrait à Marseille (gratuit)',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 5 },
          },
        },
      },
    ];

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://printforge13.vercel.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      locale: 'fr',
      line_items,
      shipping_address_collection: { allowed_countries: ['FR', 'BE', 'CH', 'LU', 'MC'] },
      shipping_options,
      metadata: {
        items_count: items.length,
        colors: items.map(i => `${i.productId}:${i.color||'N/A'}×${i.qty||1}`).join(' | '),
        free_shipping: freeShipping ? 'oui' : 'non',
        source: 'printforge13-website',
      },
      success_url: `${baseUrl}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/panier.html`,
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });

  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Réessaie ou contacte-nous.' });
  }
};
