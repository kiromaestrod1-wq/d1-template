export async function getSession(kv, businessId, customerPhone) {
  try {
    const raw = await kv.get(`session:${businessId}:${customerPhone}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('getSession error:', err);
    return null;
  }
}

export async function saveSession(kv, businessId, customerPhone, sessionData) {
  try {
    await kv.put(
      `session:${businessId}:${customerPhone}`,
      JSON.stringify(sessionData),
      { expirationTtl: 3600 } // 1 hour
    );
  } catch (err) {
    console.error('saveSession error:', err);
  }
}

export async function handleBookingFlow(customerPhone, customerMessage, business, kv, sendMessage) {
  const fallback = async () => {
    await sendMessage(customerPhone, "Sorry, something went wrong. Please try again or call us directly 🙏");
  };

  try {
    let session = await getSession(kv, business.id, customerPhone);

    // No session yet — start booking
    if (!session || session.state === 'idle' || session.state === 'menu') {
      await saveSession(kv, business.id, customerPhone, {
        state: 'booking_name',
        name: null,
        num_people: null,
        preferred_date: null,
        business_id: business.id,
      });
      await sendMessage(customerPhone,
        "Great! Let's book your appointment 🗓️\n\nFirst — what's your name?"
      );
      return;
    }

    // STATE: waiting for name
    if (session.state === 'booking_name') {
      if (customerMessage.length < 2) {
        await sendMessage(customerPhone, "Please share your full name 😊");
        return;
      }
      const name = customerMessage;
      session.name  = name;
      session.state = 'booking_num';
      await saveSession(kv, business.id, customerPhone, session);
      await sendMessage(customerPhone,
        `Nice to meet you ${name}! 😊\n\nHow many people are coming?`
      );
      return;
    }

    // STATE: waiting for number of people
    if (session.state === 'booking_num') {
      const num = parseInt(customerMessage, 10);
      if (isNaN(num) || num < 1 || num > 10) {
        await sendMessage(customerPhone, "Please reply with a number between 1 and 10");
        return;
      }
      session.num_people = num;
      session.state      = 'booking_date';
      await saveSession(kv, business.id, customerPhone, session);
      await sendMessage(customerPhone,
        "Perfect! What day and time works best for you?\n\nExample: Saturday 10am or Monday 3pm"
      );
      return;
    }

    // STATE: waiting for preferred date
    if (session.state === 'booking_date') {
      if (customerMessage.length < 5) {
        await sendMessage(customerPhone,
          "Please share a day and time, for example: Saturday 10am"
        );
        return;
      }
      session.preferred_date = customerMessage;
      session.state          = 'booking_done';

      // Confirm to customer
      await sendMessage(customerPhone,
        `All done! ✅ Here's your booking:\n\n` +
        `👤 ${session.name}\n` +
        `👥 ${session.num_people} people\n` +
        `📅 ${session.preferred_date}\n` +
        `📍 ${business.location_address}\n\n` +
        `We'll confirm your spot shortly!\n` +
        `See you at ${business.business_name} 💇‍♀️`
      );

      // Alert the business owner
      await sendMessage(business.owner_phone,
        `🔔 NEW BOOKING REQUEST\n` +
        `─────────────────────\n` +
        `👤 Name: ${session.name}\n` +
        `📞 Customer: ${customerPhone}\n` +
        `👥 People: ${session.num_people}\n` +
        `📅 Requested: ${session.preferred_date}\n` +
        `─────────────────────\n` +
        `Reply to confirm or call customer directly.`
      );

      // Clear session
      await kv.delete(`session:${business.id}:${customerPhone}`);
      return;
    }

  } catch (err) {
    console.error('handleBookingFlow error:', err);
    await fallback();
  }
}
