import { handleMessage } from './handler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Meta sends GET to verify your webhook endpoint
    if (request.method === 'GET') {
      const mode      = url.searchParams.get('hub.mode');
      const token     = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === env.VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // Meta sends POST for every incoming message
    if (request.method === 'POST') {
      try {
        const body    = await request.json();
        const value   = body?.entry?.[0]?.changes?.[0]?.value;
        const message = value?.messages?.[0];

        if (!message) return new Response('OK', { status: 200 }); // status update, ignore

        const customerPhone = message.from;
        const messageText   = message.text?.body?.trim() ?? '';
        const phoneNumberId = value.metadata.phone_number_id;

        if (!messageText) return new Response('OK', { status: 200 });

        // Load business from D1
        const business = await env.DB.prepare(
          'SELECT * FROM businesses WHERE phone_number_id = ?'
        ).bind(phoneNumberId).first();

        if (!business) return new Response('OK', { status: 200 });

        // Load FAQs for this business
        const { results: faqs } = await env.DB.prepare(
          'SELECT * FROM faqs WHERE business_id = ?'
        ).bind(business.id).all();

        // Send a WhatsApp message via Meta Cloud API
        const sendMessage = async (toPhone, text) => {
          await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: toPhone,
              type: 'text',
              text: { body: text },
            }),
          });
        };

        ctx.waitUntil(
          handleMessage(customerPhone, messageText, business, faqs, env.KV, sendMessage)
        );

        return new Response('OK', { status: 200 });

      } catch (err) {
        console.error('Worker error:', err);
        return new Response('OK', { status: 200 }); // always 200 to Meta
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
