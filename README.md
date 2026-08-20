# Nexus Legacy Searcher

Site complet avec backend Python, base de données locale et interface web.

## Démarrage local

Windows PowerShell :

```powershell
./start.ps1
```

Ou directement :

```powershell
python .\server.py
```

Puis ouvrir :

```text
http://localhost:8000
```

## Variables d'environnement

Le fichier `.env` contient :

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
NEXUS_ADMIN_PASSWORD=nexus
PORT=8000
```

## Déploiement public

Pour un déploiement public, il faut :

1. héberger le dossier projet sur un serveur compatible Python,
2. définir les variables d'environnement sur le serveur,
3. démarrer `server.py` avec un process long-running,
4. s'assurer que le port de l'hôte est exposé.

Exemple de commande de serveur :

```bash
PORT=8000 python server.py
```

## Sécurité

- Ne pas publier un `.env` avec des clés réelles.
- Garder la clé Gemini côté serveur.
- Ne pas exposer le mot de passe admin dans le frontend.
