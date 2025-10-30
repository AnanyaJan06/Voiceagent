// Simple in-memory state (later: MongoDB session)
const sessions = new Map();

export function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      callSid,
      partType: null,
      vehicle: null,
      step: 'greeting' // greeting → part → vehicle → confirm
    });
  }
  return sessions.get(callSid);
}

export function updateSession(callSid, updates) {
  const session = getSession(callSid);
  Object.assign(session, updates);
}