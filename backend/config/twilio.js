import twilio from 'twilio';
import 'dotenv/config';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export { client };