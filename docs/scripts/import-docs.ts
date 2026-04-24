#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..');
const SRC_CONTENT = resolve(import.meta.dir, '..', 'src', 'content');

const SECTIONS = ['guides', 'reference', 'recipes', 'blog'] as const;

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim().replace(/[<>]/g, '') : 'Untitled';
}

function extractDescription(md: string): string | undefined {
  const body = md.replace(/^---[\s\S]*?---\n/, '');
  const lines = body.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) continue;
    if (t.startsWith('>')) continue;
    if (t.startsWith('```')) continue;
    if (t.startsWith('|')) continue;
    if (t.startsWith('<')) continue;
    const plain = t
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .slice(0, 200);
    if (plain.length > 20) return plain;
  }
  return undefined;
}

function hasFrontmatter(md: string): boolean {
  return md.startsWith('---\n');
}

function yamlEscape(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function addFrontmatter(md: string, section: string): string {
  if (hasFrontmatter(md)) return md;
  const title = extractTitle(md);
  const description = extractDescription(md);
  const lines = ['---', `title: ${yamlEscape(title)}`];
  if (description) lines.push(`description: ${yamlEscape(description)}`);
  lines.push('---', '');
  return lines.join('\n') + md;
}

let total = 0;
for (const section of SECTIONS) {
  const srcDir = join(ROOT, section);
  const dstDir = join(SRC_CONTENT, section);
  mkdirSync(dstDir, { recursive: true });
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.md'));
  for (const f of files) {
    const raw = readFileSync(join(srcDir, f), 'utf8');
    const out = addFrontmatter(raw, section);
    writeFileSync(join(dstDir, f), out);
    total++;
  }
  console.log(`${section}: ${files.length} files`);
}
console.log(`Total: ${total} files`);
