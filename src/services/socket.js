import io from 'socket.io-client';

// In dev the CRA client runs on :3000 while the server runs on :5000 (use the
// page's hostname so other devices on the LAN work too). In production the
// server serves the build, so same-origin is always correct.
const SERVER_URL =
  process.env.REACT_APP_SERVER_URL ||
  (window.location.port === '3000'
    ? `http://${window.location.hostname}:5000`
    : window.location.origin);

const socket = io(SERVER_URL);

export default socket;
