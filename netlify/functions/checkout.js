// ─────────────────────────────────────────────────────────────
// PrintForge13 – Netlify Function : Stripe Checkout
// Fichier : netlify/functions/checkout.js
//
// SETUP :
//   1. Dans le dashboard Netlify → Site settings → Environment variables
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
    unit_amount: 2490, // 24,90 € en centimes
    currency: 'eur',
    images: ['https://printforge13.netlify.app/images/medal-rack.jpg'],
  },
};

// ── Handler principal ─────────────────────────────────────────
exports.handler = async (event) => {

  // CORS – autorise les requêtes depuis ton domaine
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Réponse aux pre-flight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { productId, color, quantity = 1 } = JSON.parse(event.body);

    // Validation
    const product = PRODUCTS[productId];
    if (!product) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Produit inconnu : ${productId}` }),
      };
    }

    if (quantity < 1 || quantity > 99) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Quantité invalide' }),
      };
    }

    // Construction du nom affiché sur la page Stripe
    // ex : "Porte-Médailles Sport – Orange Forge"
    const displayName = color
      ? `${product.name} – ${color}`
      : product.name;

    // Création de la session Stripe Checkout
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

      // Collecte de l'adresse de livraison
      shipping_address_collection: {
        allowed_countries: ['FR', 'BE', 'CH', 'LU', 'MC'],
      },

      // Options de livraison
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 490, currency: 'eur' }, // 4,90 €
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
            fixed_amount: { amount: 0, currency: 'eur' }, // Gratuit
            display_name: 'Retrait à Marseille (gratuit)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 5 },
            },
          },
        },
      ],

      // Métadonnées pour retrouver la commande dans Stripe Dashboard
      metadata: {
        product_id: productId,
        color: color || 'Non spécifiée',
        source: 'printforge13-website',
      },

      // Pages de redirection après paiement
      success_url: `${process.env.URL || 'https://printforge13.netlify.app'}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.URL || 'https://printforge13.netlify.app'}/#boutique`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sessionId: session.id, url: session.url }),
    };

  } catch (err) {
    console.error('Stripe error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur. Réessaie ou contacte-nous.' }),
    };
  }
};
