// ONE HELLO PER ARRIVAL (1 Nov 2026). On 31 Oct two "Good morning, sir." landed
// two seconds apart: his Mac and his phone each asked the server "greeted yet?"
// (briefState), got no, and each started a greeting, because the greeted stamp
// is written only when the words are DELIVERED, up to 45 s later. The server
// is the one place both requests meet, so it holds the claim: a greeting
// started in the last two minutes means every other request stands down.

export const CLAIM_MS = 2 * 60e3;

export function makeGreetClaim(clock = Date.now) {
  let at = 0;
  return {
    /** true when this request may start a greeting; false when one just started */
    take() {
      const now = clock();
      if (at && now - at < CLAIM_MS) return false;
      at = now;
      return true;
    },
    /** a greeting that failed to start gives its claim back */
    release() { at = 0; },
  };
}
