/* Génère config.js à partir du .env : `node build-config.cjs` */
const fs = require('fs');
const path = require('path');
const envCandidates = ['.env', '.env.example'];
const envPath = envCandidates
  .map((name) => path.join(__dirname, name))
  .find((p) => fs.existsSync(p));

if (!envPath) {
  console.error('Aucun fichier .env ni .env.example trouvé. Créez le fichier de configuration avant le déploiement.');
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const m = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const out = `/* Généré depuis ${path.basename(envPath)} par \`node build-config.cjs\`. */
window.NEXUS_ENV = {
  GEMINI_API_KEY: ${JSON.stringify(env.GEMINI_API_KEY || '')},
  GEMINI_MODEL: ${JSON.stringify(env.GEMINI_MODEL || 'gemini-3.6-flash')},
  NEXUS_ADMIN_PASSWORD: ${JSON.stringify(env.NEXUS_ADMIN_PASSWORD || 'nexus')}
};
`;
fs.writeFileSync(path.join(__dirname, 'config.js'), out);
console.log('config.js généré depuis ' + path.basename(envPath) + (env.GEMINI_API_KEY ? ' avec la clé Gemini.' : ' sans clé Gemini configurée.'));
