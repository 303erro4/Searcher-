NEXUS LEGACY SEARCHER — VERSION CORRIGÉE

Cette version conserve la hiérarchie et le style du site.

Lancement local :
  python server.py
Puis ouvrir :
  http://localhost:8000

Ne lancez pas index.html directement et n'utilisez pas python -m http.server :
les comptes, crédits, administration et Gemini utilisent les routes /api du serveur.

Gemini :
  renseignez GEMINI_API_KEY dans .env.
  La clé reste côté serveur.

Admin :
  mot de passe par défaut : admin57ksportback303

Fonctions :
- 5 crédits au nouveau compte
- 1 crédit par recherche
- 5 recherches maximum par jour
- 5 résultats maximum par recherche
- administration des crédits et du statut des comptes
- recherche sur les lignes brutes TXT/CSV/JSON
- Gemini uniquement pour présenter les correspondances trouvées
