# 📅 Mon Agenda

Agenda personnel accessible via un lien, sur téléphone et ordinateur.
Vue semaine, création d'un événement en 2 clics (bouton **+ Ajouter** sur un jour → titre → Enregistrer).

## Comment ça marche

- **Sans configuration** : l'app fonctionne immédiatement, mais les événements
  sont stockés dans le navigateur de chaque appareil (pas de synchro).
- **Avec Supabase configuré** : les événements sont stockés en ligne et
  visibles depuis tous vos appareils.

## Étape 1 — Activer la synchronisation (Supabase, gratuit)

1. Créez un compte sur <https://supabase.com> (gratuit).
2. Créez un nouveau projet (nom : `agenda`, région : Europe/Paris ou Frankfurt).
3. Dans le menu de gauche, ouvrez **SQL Editor** → **New query**,
   collez le contenu du fichier [`supabase-setup.sql`](supabase-setup.sql) et cliquez **Run**.
4. Dans **Project Settings → API**, copiez :
   - la **Project URL** (ex : `https://abcdefgh.supabase.co`)
   - la clé **anon public**
5. Ouvrez le fichier [`config.js`](config.js) et collez ces deux valeurs à la place
   des textes `COLLEZ_ICI_...`.

## Étape 2 — Mettre en ligne (GitHub Pages, gratuit)

1. Créez un compte sur <https://github.com> si besoin.
2. Créez un nouveau dépôt (repository), par exemple `agenda`.
   Choisissez **Private** si vous voulez cacher le code, mais notez que
   GitHub Pages rendra quand même la page accessible via son lien.
3. Envoyez les fichiers de ce dossier dans le dépôt (via l'interface web
   "uploading an existing file", ou avec git).
4. Dans le dépôt : **Settings → Pages → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)` → **Save**.
5. Après 1-2 minutes, votre agenda est accessible sur :
   `https://VOTRE_PSEUDO.github.io/agenda/`

### Sur le téléphone

Ouvrez le lien dans le navigateur, puis **"Ajouter à l'écran d'accueil"** :
l'agenda aura sa propre icône, comme une vraie app.

## ⚠️ Note de confidentialité

La clé Supabase "anon" est visible dans le code de la page : toute personne
qui possède le lien peut lire et modifier votre agenda. Pour un usage perso
(sport, rendez-vous entre amis), c'est généralement acceptable — ne partagez
simplement pas le lien publiquement, et n'y mettez rien de sensible.
