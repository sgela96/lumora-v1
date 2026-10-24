import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectBrowser, detectOs } from '../src/capture/environment';

test('detects common browsers and operating systems', () => {
  const chromeMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const edgeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
  const safariIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const firefoxAndroid = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0';
  assert.equal(detectBrowser(chromeMac), 'Chrome 130');
  assert.equal(detectOs(chromeMac), 'macOS 10.15');
  assert.equal(detectBrowser(edgeWin), 'Edge 130');
  assert.equal(detectOs(edgeWin), 'Windows 10/11');
  assert.equal(detectBrowser(safariIos), 'Safari 17');
  assert.equal(detectOs(safariIos), 'iOS 17');
  assert.equal(detectBrowser(firefoxAndroid), 'Firefox 131');
  assert.equal(detectOs(firefoxAndroid), 'Android 14');
});
