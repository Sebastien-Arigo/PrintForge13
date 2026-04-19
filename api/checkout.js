// ─────────────────────────────────────────────────────────────
// PrintForge13 – Vercel Serverless Function : Stripe Checkout
// Fichier : api/checkout.js
//
// SETUP :
//   1. Dans le dashboard Vercel → ton projet → Settings → Environment Variables
//      Ajoute : STRIPE_SECRET_KEY = sk_live_xxxxxxxxxxxxxxxx
//   2. npm install stripe  (dans le dossier racine du projet)
// ─────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ── Catalogue des produits ────────────────────────────────────
// Ajoute ici chaque produit avec son prix en centimes (EUR)
// "images" : URLs publiques accessibles par Stripe (hébergées sur ton site ou CDN)
const PRODUCTS = {
  'medal-rack': {
    name: 'Porte-Médailles Sport – PrintForge13',
    description: 'Support mural impression 3D pour médailles trail, course, CrossFit, Hyrox. Capacité 10+ médailles. Imprimé à la commande à Marseille.',
    unit_amount: 1490, // 14,90 € en centimes
    currency: 'eur',
    images: ['https://printforge13.netlify.app/images/medal-rack.jpg'],
  },
};

// ── Handler Vercel ────────────────────────────────────────────
// Vercel utilise (req, res) au lieu du handler Netlify
module.exports = async (req, res) => {

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { productId, color, quantity = 1 } = req.body;

    const product = PRODUCTS[productId];
    if (!product) {
      return res.status(400).json({ error: `Produit inconnu : ${productId}` });
    }

    if (quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: 'Quantité invalide' });
    }

    const displayName = color
      ? `${product.name} – ${color}`
      : product.name;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      locale: 'fr',

      line_items: [
        {
          quantity,
          price_data: {
            currency: product.currency,
            unit_amount: product.unit_amount,
            product_data: {
              name: displayName,
              description: color
                ? `${product.description}\nCouleur sélectionnée : ${color}`
                : product.description,
              images: product.images,
            },
          },
        },
      ],

      shipping_address_collection: {
        allowed_countries: ['FR', 'BE', 'CH', 'LU', 'MC'],
      },

      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 490, currency: 'eur' },
            display_name: 'Colissimo Suivi',
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
      ],

      metadata: {
        product_id: productId,
        color: color || 'Non spécifiée',
        source: 'printforge13-website',
      },

      success_url: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://printforge13.vercel.app'}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://printforge13.vercel.app'}/#boutique`,
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });

  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Réessaie ou contacte-nous.' });
  }
};
