// Minimal preload. Context isolation is on and node integration is off, so the
// renderer (the React console) runs as a normal web page talking to the local
// server over HTTP/sockets. No privileged bridge is needed in v1.
window.addEventListener('DOMContentLoaded', () => {});
