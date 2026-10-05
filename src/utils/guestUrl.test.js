import { guestBase } from './guestUrl';

const at = (url) => new URL(url);

test('on localhost, guests get the LAN address', () => {
  expect(guestBase('192.168.1.63:5000', at('http://localhost:5000/'))).toBe('http://192.168.1.63:5000');
  expect(guestBase('192.168.1.63:5000', at('http://127.0.0.1:5000/'))).toBe('http://192.168.1.63:5000');
});

test('through a tunnel or domain, guests get the address the page is on', () => {
  expect(guestBase('192.168.1.63:5000', at('https://cantina-abc.trycloudflare.com/'))).toBe('https://cantina-abc.trycloudflare.com');
  expect(guestBase('192.168.1.63:5000', at('https://cantina.sh0ty.dev/bar'))).toBe('https://cantina.sh0ty.dev');
});

test('already on a LAN address, nothing changes', () => {
  expect(guestBase('192.168.1.63:5000', at('http://192.168.1.63:5000/'))).toBe('http://192.168.1.63:5000');
});

test('without a LAN address, fall back to the page origin', () => {
  expect(guestBase(null, at('http://localhost:5000/'))).toBe('http://localhost:5000');
});
