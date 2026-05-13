import { handleBookingFlow, getSession, saveSession } from './booking.js';

const GREETINGS = ['hi','hello','hey','good morning','good afternoon',
  'good evening','akwaaba','ete sen','start','menu','0','back','home'];

export async function handleMessage(customerPhone, messageText, business, faqs, kv, sendMessage) {
  const msg = messageText.toLowerCase().trim();

  try {
    // STEP 1: Check for active booking session
    const session = await getSession(kv, business.id, customerPhone);
    if (session && session.state !== 'idle' && session.state !== 'menu') {
      await handleBookingFlow(customerPhone, messageText, business, kv, sendMessage);
      return;
    }

    // STEP 2: Greeting check
    const isGreeting = GREETINGS.some(g => msg === g || msg.startsWith(g + ' '));
    if (isGreeting) {
      await saveSession(kv, business.id, customerPhone, {
        state: 'menu', name: null, num_people: null,
        preferred_date: null, business_id: business.id,
      });
      await sendMessage(customerPhone, business.greeting_message);
      return;
    }

    // STEP 3: FAQ keyword matching
    let bestFaq   = null;
    let bestScore = 0;

    for (const faq of faqs) {
      const keywords = faq.question_keywords
        .split(',')
        .map(k => k.toLowerCase().trim())
        .filter(Boolean);

      let score = 0;
      for (const kw of keywords) {
        if (msg === kw || msg.includes(kw)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestFaq   = faq;
      }
    }

    // STEP 4: FAQ matched
    if (bestFaq && bestScore > 0) {
      if (bestFaq.answer.includes('BOOKING')) {
        await handleBookingFlow(customerPhone, messageText, business, kv, sendMessage);
      } else {
        await sendMessage(customerPhone, bestFaq.answer);
      }
      return;
    }

    // STEP 5: No match fallback
    await sendMessage(customerPhone,
      "Sorry, I didn't quite get that 😊\n\n" +
      "Here's what I can help with:\n" +
      "1️⃣ Prices & Services\n" +
      "2️⃣ Location & Directions\n" +
      "3️⃣ Book Appointment\n" +
      "4️⃣ Contact Us\n\n" +
      "Just reply with a number!"
    );

  } catch (err) {
    console.error('handleMessage error:', err);
    await sendMessage(customerPhone,
      "Sorry, something went wrong. Please try again or call us directly 🙏"
    );
  }
}
