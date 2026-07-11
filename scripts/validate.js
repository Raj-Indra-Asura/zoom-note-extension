#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'manifest.json');
const srcDir = path.join(repoRoot, 'src');
let failures = 0;

function report(pass, message) {
  const prefix = pass ? 'PASS' : 'FAIL';
  console.log(`[${prefix}] ${message}`);
  if (!pass) {
    failures += 1;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function validateManifest() {
  if (!fs.existsSync(manifestPath)) {
    report(false, 'manifest.json exists');
    return null;
  }

  const manifest = readJson(manifestPath);
  report(manifest.manifest_version === 3, 'manifest_version is 3');
  report(Boolean(manifest.name), 'manifest has a name');
  report(Boolean(manifest.version), 'manifest has a version');
  report(Boolean(manifest.background && manifest.background.service_worker), 'manifest has a background service worker');
  report(Boolean(manifest.action && manifest.action.default_popup), 'manifest has a default popup');
  report(Boolean(manifest.icons && Object.keys(manifest.icons).length > 0), 'manifest has icons');
  const requiredProviderHosts = [
    'https://api.openai.com/*',
    'https://api.groq.com/*',
    'https://openrouter.ai/*'
  ];
  for (const providerHost of requiredProviderHosts) {
    report(manifest.host_permissions?.includes(providerHost), `manifest permits provider host: ${providerHost}`);
  }
  report(
    manifest.optional_host_permissions?.includes('https://*/*'),
    'manifest can request custom HTTPS provider access'
  );

  const referencedFiles = new Set();
  if (manifest.background?.service_worker) {
    referencedFiles.add(manifest.background.service_worker);
  }
  if (manifest.action?.default_popup) {
    referencedFiles.add(manifest.action.default_popup);
  }
  for (const iconPath of Object.values(manifest.icons || {})) {
    referencedFiles.add(iconPath);
  }
  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    referencedFiles.add(iconPath);
  }

  for (const relativePath of referencedFiles) {
    report(exists(relativePath), `referenced file exists: ${relativePath}`);
  }
  return manifest;
}

function validateJavaScriptSyntax() {
  if (!fs.existsSync(srcDir)) {
    report(false, 'src directory exists');
    return;
  }
  const files = fs.readdirSync(srcDir).filter((file) => file.endsWith('.js'));
  for (const fileName of files) {
    const filePath = path.join(srcDir, fileName);
    try {
      childProcess.execFileSync(process.execPath, ['--check', '--experimental-default-type=module', filePath], {
        stdio: 'pipe'
      });
      report(true, `syntax check passed: src/${fileName}`);
    } catch (error) {
      report(false, `syntax check failed: src/${fileName}\n${error.stderr?.toString() || error.message}`);
    }
  }
}

function validateHtml(fileName) {
  const filePath = path.join(srcDir, fileName);
  if (!fs.existsSync(filePath)) {
    report(false, `${fileName} exists`);
    return;
  }
  const html = fs.readFileSync(filePath, 'utf8');
  const inlineScriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script(?:\s[^>]*)?>/gi;
  let match;
  let hasInlineScript = false;
  while ((match = inlineScriptPattern.exec(html)) !== null) {
    if (match[1].trim()) {
      hasInlineScript = true;
      break;
    }
  }
  report(!hasInlineScript, `${fileName} has no inline script content`);
  report(!/\son[a-z]+\s*=\s*/i.test(html), `${fileName} has no inline event handlers`);
}

(function main() {
  validateManifest();
  validateJavaScriptSyntax();
  validateHtml('popup.html');
  validateHtml('offscreen.html');

  if (failures > 0) {
    console.error(`Validation failed with ${failures} issue(s).`);
    process.exit(1);
  }
  console.log('All validation checks passed.');
})();
