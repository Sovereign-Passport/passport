/* ============ SPID i18n — shared, no external asset ============
 * One table per concept: [en, fr, es]. The source string (EN or FR, as it
 * appears in the code) is the key, so nothing has to be rewritten in place.
 * A MutationObserver also translates dynamically-inserted text and prefixes
 * (e.g. "Vous : <texte>" -> "You: <texte>").
 *
 * Language: localStorage 'spidLang' (shared by Portail + Passport, same
 * origin) -> navigator.languages -> EN (default).
 */
(function (global) {
  var LANGS = ['fr', 'en', 'es'];

  var ROWS = [
    ['Sovereign Passport','Passeport Souverain','Pasaporte Soberano'],
    ['About Sovereign Passport','À propos du Passeport Souverain','Acerca del Pasaporte Soberano'],
    ['Welcome','Bienvenue','Bienvenido'],
    ['Identity','Identité','Identidad'],
    ['My Memberships','Mes adhésions','Mis membresías'],
    ['Memberships','Adhésions','Membresías'],
    ['Groups and Communities','Groupes et communautés','Grupos y comunidades'],
    ['Vault Files','Fichiers du coffre','Archivos del almacén'],
    ['Files','Fichiers','Archivos'],
    ['Health','Santé','Salud'],
    ['Settings','Paramètres','Ajustes'],
    ['Backup & Sync','Sauvegarde et synchro','Copia y sincronización'],
    ['Backup file','Fichier de sauvegarde','Archivo de copia'],
    ['Download Backup','Télécharger la sauvegarde','Descargar copia'],
    ['Restore','Restaurer','Restaurar'],
    ['Restore from Backup','Restaurer depuis une sauvegarde','Restaurar desde copia'],
    ['From file','Depuis un fichier','Desde archivo'],
    ['From sync link','Depuis un lien de synchro','Desde enlace de sincro'],
    ['Sync to another device','Synchroniser vers un autre appareil','Sincronizar a otro dispositivo'],
    ['Sync link','Lien de synchro','Enlace de sincro'],
    ['Danger Zone','Zone sensible','Zona de riesgo'],
    ['Language','Langue','Idioma'],
    ['Handle','Pseudonyme','Alias'],
    ['Change Handle','Changer de pseudonyme','Cambiar alias'],
    ['Your handle','Votre pseudonyme','Su alias'],
    ['Password','Mot de passe','Contraseña'],
    ['Confirm password','Confirmer le mot de passe','Confirmar contraseña'],
    ['Confirm your password','Confirmez votre mot de passe','Confirme su contraseña'],
    ['Enter a strong password','Entrez un mot de passe fort','Introduzca una contraseña segura'],
    ['Your vault password','Votre mot de passe de coffre','Su contraseña del almacén'],
    ['Unlocked · encrypted','Déverrouillé · chiffré','Desbloqueado · cifrado'],
    ['Stored on this device only','Stocké sur cet appareil uniquement','Guardado solo en este dispositivo'],
    ['Your identity.','Votre identité.','Su identidad.'],
    ['Yours alone.','Rien qu’à vous.','Solo suyo.'],
    ['Your status','Votre statut','Su estado'],
    ['Cluster','Cluster','Clúster'],
    ['Cluster name','Nom du cluster','Nombre del clúster'],
    ['Your cluster','Votre cluster','Su clúster'],
    ['New Cluster','Nouveau cluster','Nuevo clúster'],
    ['Admin cluster','Cluster administrateur','Clúster administrador'],
    ['Delete cluster','Supprimer le cluster','Eliminar clúster'],
    ['Vine endpoint','Point de terminaison de la Vine','Extremo de la Vine'],
    ['Become a Vine','Devenir une Vine','Convertirse en Vine'],
    ['Join the network · Become a Vine','Rejoindre le réseau · Devenir une Vine','Unirse a la red · Convertirse en Vine'],
    ['Invite a member','Inviter un membre','Invitar a un miembro'],
    ['Invite a member to a group or a Vine','Inviter un membre à un groupe ou une Vine','Invitar a un miembro a un grupo o una Vine'],
    ['Approve member','Approuver le membre','Aprobar miembro'],
    ['Decline','Refuser','Rechazar'],
    ['Member','Membre','Miembro'],
    ['Member DID','DID du membre','DID del miembro'],
    ['Invite Link','Lien d’invitation','Enlace de invitación'],
    ['Paste invite link','Coller le lien d’invitation','Pegar enlace de invitación'],
    ['Open an invitation','Ouvrir une invitation','Abrir una invitación'],
    ['Install Passport','Installer le Passeport','Instalar el Pasaporte'],
    ['Storage','Stockage','Almacenamiento'],
    ['Private','Privé','Privado'],
    ['Shared','Partagé','Compartido'],
    ['Credential','Titre','Credencial'],
    ['Membership Credential','Titre d’adhésion','Credencial de membresía'],
    ['Credential Offer','Offre de titre','Oferta de credencial'],
    ['Current state','État actuel','Estado actual'],
    ['Requirements','Conditions','Requisitos'],
    ['What you get','Ce que vous obtenez','Lo que obtiene'],
    ['— select a cluster —','— choisir un cluster —','— elegir un clúster —'],
    ['Choose a','Choisissez un','Elija un'],
    ['Delete all local data — irreversible','Supprimer toutes les données locales — irréversible','Eliminar todos los datos locales — irreversible'],
    ['Reset Passport','Réinitialiser le Passeport','Restablecer el Pasaporte'],
    ['Wrong password. Try again.','Mot de passe incorrect. Réessayez.','Contraseña incorrecta. Inténtelo de nuevo.'],
    ['This decision is terminal.','Cette décision est définitive.','Esta decisión es definitiva.'],
    ['A Cluster attached to a Vine is never deleted on a single actor’s word.','Un cluster rattaché à une Vine n’est jamais supprimé sur la parole d’un seul acteur.','Un clúster vinculado a una Vine nunca se elimina por la palabra de un solo actor.'],
    ['Save encrypted .passport file — the sovereign way','Enregistrer un fichier .passport chiffré — la voie souveraine','Guardar archivo .passport cifrado — la vía soberana'],
    ['English · EN/FR coming soon','Français · EN/FR à venir','Español · EN/FR próximamente'],
    ['Your Passport Address','Votre adresse de Passeport','Su dirección de Pasaporte'],
    ['Passport Address','Adresse de Passeport','Dirección de Pasaporte'],
    ['My Passport Address','Mon adresse de Passeport','Mi dirección de Pasaporte'],
    ['Passport Health','Santé du Passeport','Salud del Pasaporte'],
    ['Direct transfer not yet implemented.','Transfert direct pas encore disponible.','Transferencia directa aún no disponible.'],
    ['15-minute encrypted relay link','Lien relais chiffré de 15 minutes','Enlace relé cifrado de 15 minutos'],
    ['checking…','vérification…','comprobando…'],
    ['Personal note (optional)','Note personnelle (facultatif)','Nota personal (opcional)'],
    ['Short description','Description courte','Descripción breve'],
    ['Vault','Coffre','Almacén']
  ];

  // Build per-language dictionaries from the rows.
  var DICT = { en: {}, fr: {}, es: {} };
  ROWS.forEach(function (r) {
    var en = r[0], fr = r[1], es = r[2];
    DICT.en[en] = en; DICT.en[fr] = en;
    DICT.fr[en] = fr; DICT.fr[fr] = fr;
    DICT.es[en] = es; DICT.es[fr] = es;
  });
  // Keys sorted longest-first (prefix matching).
  var KEYS = Object.keys(DICT.es).sort(function (a, b) { return b.length - a.length; });

  function detect() {
    try { var s = localStorage.getItem('spidLang'); if (s && LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    var ls = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < ls.length; i++) {
      var l = String(ls[i] || '').slice(0, 2).toLowerCase();
      if (LANGS.indexOf(l) >= 0) return l;
    }
    return 'en';
  }

  var lang = detect();

  function xlate(raw) {
    var d = DICT[lang];
    if (!d || lang === 'source') return raw;
    var lead = (raw.match(/^\s*/) || [''])[0];
    var rest = raw.slice(lead.length);
    if (d[rest] !== undefined) return lead + d[rest];
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (rest.indexOf(k) === 0 && d[k] !== undefined) return lead + d[k] + rest.slice(k.length);
    }
    return raw;
  }

  function txt(node) {
    var raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    var out = xlate(raw);
    if (node.nodeValue !== out) node.nodeValue = out;
  }

  function attrs(el) {
    ['placeholder', 'title', 'aria-label'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a);
      if (!v) return;
      var out = xlate(v);
      if (out !== v) el.setAttribute(a, out);
    });
  }

  function walk(node) {
    if (node.nodeType === 3) { txt(node); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE' || tag === 'PRE') return;
    attrs(node);
    for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
  }

  function apply(root) { walk(root || document.body); }

  function wire() {
    var btns = document.querySelectorAll('.lang-btn[data-lang]');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
        b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
      })(btns[i]);
    }
  }

  function start() {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-spid-lang', lang);
    apply(document.body);
    wire();
    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'childList') {
            for (var j = 0; j < m.addedNodes.length; j++) apply(m.addedNodes[j]);
          } else if (m.type === 'characterData') {
            txt(m.target);
          }
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  }

  function setLang(l) {
    if (LANGS.indexOf(l) < 0) l = 'en';
    try { localStorage.setItem('spidLang', l); } catch (e) {}
    location.reload();
  }

  global.spidLang = function () { return lang; };
  global.spidSetLang = setLang;
  global.spidApply = apply;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
