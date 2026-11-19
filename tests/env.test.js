import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../server/env.js';

test('.env を読む。すでにある環境変数は上書きしない。なければ null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-env-'));
  const file = join(dir, '.env');
  writeFileSync(file, 'CF_TEST_NEW=from-file\nCF_TEST_KEEP=from-file\n');
  process.env.CF_TEST_KEEP = 'from-shell';
  assert.equal(loadEnv([join(dir, 'none'), file]), file);
  assert.equal(process.env.CF_TEST_NEW, 'from-file');
  assert.equal(process.env.CF_TEST_KEEP, 'from-shell');
  assert.equal(loadEnv([join(dir, 'none')]), null);
  delete process.env.CF_TEST_NEW; delete process.env.CF_TEST_KEEP;
});
