const sessions = new Map();

export function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      callSid,
      partType: null,
      vehicle: null,
      step: 'greeting'
    });
  }
  return sessions.get(callSid);
}

export function updateSession(callSid, updates) {
  const session = getSession(callSid);
  Object.assign(session, updates);
}