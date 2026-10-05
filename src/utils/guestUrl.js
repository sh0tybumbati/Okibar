const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * The address guests should open. On the venue computer itself the page is loaded from
 * localhost, which a phone cannot reach, so use the laptop's LAN address. Anywhere else
 * (a tunnel, a domain, a LAN address already) the page's own origin is the one guests can reach.
 */
export function guestBase(lanHost, location) {
  if (lanHost && LOOPBACK.has(location.hostname)) return `http://${lanHost}`;
  return location.origin;
}
