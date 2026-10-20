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
    ['Sovereign Passport ID','ID Passeport Souverain','ID Pasaporte Soberano'],
    ['About Sovereign Passport','\u00c0 propos du Passeport Souverain','Acerca del Pasaporte Soberano'],
    ['Welcome','Bienvenue','Bienvenido'],
    ['Welcome to the community!','Bienvenue dans la communaut\u00e9 !','\u00a1Bienvenido a la comunidad!'],
    ['Creating your Passport','Cr\u00e9ation de votre Passeport','Creando su Pasaporte'],
    ['Identity','Identit\u00e9','Identidad'],
    ['Your identity.','Votre identit\u00e9.','Su identidad.'],
    ['Yours alone.','Rien qu\u2019\u00e0 vous.','Solo suyo.'],
    ['My Memberships','Mes adh\u00e9sions','Mis membres\u00edas'],
    ['Memberships','Adh\u00e9sions','Membres\u00edas'],
    ['Groups and Communities','Groupes et communaut\u00e9s','Grupos y comunidades'],
    ['Vault Files','Fichiers du coffre','Archivos del almac\u00e9n'],
    ['Files','Fichiers','Archivos'],
    ['Vault','Coffre','Almac\u00e9n'],
    ['Health','Sant\u00e9','Salud'],
    ['Passport Health','Sant\u00e9 du Passeport','Salud del Pasaporte'],
    ['Settings','Param\u00e8tres','Ajustes'],
    ['Handle \u00b7 Language \u00b7 Backup \u00b7 Restore','Pseudonyme \u00b7 Langue \u00b7 Sauvegarde \u00b7 Restauration','Alias \u00b7 Idioma \u00b7 Copia \u00b7 Restaurar'],
    ['Backup & Sync','Sauvegarde et synchro','Copia y sincronizaci\u00f3n'],
    ['Backup file','Fichier de sauvegarde','Archivo de copia'],
    ['Download Backup','T\u00e9l\u00e9charger la sauvegarde','Descargar copia'],
    ['Restore','Restaurer','Restaurar'],
    ['Restore from Backup','Restaurer depuis une sauvegarde','Restaurar desde copia'],
    ['From file','Depuis un fichier','Desde archivo'],
    ['From sync link','Depuis un lien de synchro','Desde enlace de sincro'],
    ['Sync to another device','Synchroniser vers un autre appareil','Sincronizar a otro dispositivo'],
    ['Sync link','Lien de synchro','Enlace de sincro'],
    ['Import a .passport file or sync link','Importer un fichier .passport ou un lien de synchro','Importar un archivo .passport o un enlace de sincro'],
    ['Danger Zone','Zone sensible','Zona de riesgo'],
    ['Reset Passport','R\u00e9initialiser le Passeport','Restablecer el Pasaporte'],
    ['Delete all local data \u2014 irreversible','Supprimer toutes les donn\u00e9es locales \u2014 irr\u00e9versible','Eliminar todos los datos locales \u2014 irreversible'],
    ['Language','Langue','Idioma'],
    ['Handle','Pseudonyme','Alias'],
    ['Change Handle','Changer de pseudonyme','Cambiar alias'],
    ['Your handle','Votre pseudonyme','Su alias'],
    ['Password','Mot de passe','Contrase\u00f1a'],
    ['Confirm password','Confirmer le mot de passe','Confirmar contrase\u00f1a'],
    ['Confirm your password','Confirmez votre mot de passe','Confirme su contrase\u00f1a'],
    ['Enter a strong password','Entrez un mot de passe fort','Introduzca una contrase\u00f1a segura'],
    ['Your vault password','Votre mot de passe de coffre','Su contrase\u00f1a del almac\u00e9n'],
    ['Write this down.','Notez-le.','An\u00f3telo.'],
    ['Unlocked \u00b7 encrypted','D\u00e9verrouill\u00e9 \u00b7 chiffr\u00e9','Desbloqueado \u00b7 cifrado'],
    ['Stored on this device only','Stock\u00e9 sur cet appareil uniquement','Guardado solo en este dispositivo'],
    ['Your status','Votre statut','Su estado'],
    ['Cluster','Cluster','Cl\u00faster'],
    ['Cluster name','Nom du cluster','Nombre del cl\u00faster'],
    ['Your cluster','Votre cluster','Su cl\u00faster'],
    ['New Cluster','Nouveau cluster','Nuevo cl\u00faster'],
    ['Admin cluster','Cluster administrateur','Cl\u00faster administrador'],
    ['Delete cluster','Supprimer le cluster','Eliminar cl\u00faster'],
    ['Cluster decision','D\u00e9cision du cluster','Decisi\u00f3n del cl\u00faster'],
    ['New decision','Nouvelle d\u00e9cision','Nueva decisi\u00f3n'],
    ['Officialize my Cluster','Officialiser mon cluster','Oficializar mi cl\u00faster'],
    ['Vine endpoint','Point de terminaison de la Vine','Extremo de la Vine'],
    ['Become a Vine','Devenir une Vine','Convertirse en Vine'],
    ['Join the network \u00b7 Become a Vine','Rejoindre le r\u00e9seau \u00b7 Devenir une Vine','Unirse a la red \u00b7 Convertirse en Vine'],
    ['Invite a member','Inviter un membre','Invitar a un miembro'],
    ['Invite a member to a group or a Vine','Inviter un membre \u00e0 un groupe ou une Vine','Invitar a un miembro a un grupo o una Vine'],
    ['Invite to which membership?','Inviter \u00e0 quelle adh\u00e9sion ?','\u00bfInvitar a qu\u00e9 membres\u00eda?'],
    ['Approve member','Approuver le membre','Aprobar miembro'],
    ['Decline','Refuser','Rechazar'],
    ['Member','Membre','Miembro'],
    ['Member DID','DID du membre','DID del miembro'],
    ['Issuer role','R\u00f4le d\u2019\u00e9metteur','Rol de emisor'],
    ['One-time fee','Frais unique','Cuota \u00fanica'],
    ['Share with the invitee','Partager avec l\u2019invit\u00e9','Compartir con el invitado'],
    ['Invite Link','Lien d\u2019invitation','Enlace de invitaci\u00f3n'],
    ['Paste invite link','Coller le lien d\u2019invitation','Pegar enlace de invitaci\u00f3n'],
    ['Open an invitation','Ouvrir une invitation','Abrir una invitaci\u00f3n'],
    ['Install Passport','Installer le Passeport','Instalar el Pasaporte'],
    ['Storage','Stockage','Almacenamiento'],
    ['Private','Priv\u00e9','Privado'],
    ['Shared','Partag\u00e9','Compartido'],
    ['Device','Appareil','Dispositivo'],
    ['Referral','Parrainage','Referido'],
    ['Request','Demande','Solicitud'],
    ['Credential','Titre','Credencial'],
    ['Membership Credential','Titre d\u2019adh\u00e9sion','Credencial de membres\u00eda'],
    ['Credential Offer','Offre de titre','Oferta de credencial'],
    ['Current state','\u00c9tat actuel','Estado actual'],
    ['Requirements','Conditions','Requisitos'],
    ['What you get','Ce que vous obtenez','Lo que obtiene'],
    ['\u2014 select a cluster \u2014','\u2014 choisir un cluster \u2014','\u2014 elegir un cl\u00faster \u2014'],
    ['Choose a','Choisissez un','Elija un'],
    ['\u2190 Go back','\u2190 Retour','\u2190 Volver'],
    ['This decision is terminal.','Cette d\u00e9cision est d\u00e9finitive.','Esta decisi\u00f3n es definitiva.'],
    ['A Cluster attached to a Vine is never deleted on a single actor\u2019s word.','Un cluster rattach\u00e9 \u00e0 une Vine n\u2019est jamais supprim\u00e9 sur la parole d\u2019un seul acteur.','Un cl\u00faster vinculado a una Vine nunca se elimina por la palabra de un solo actor.'],
    ['Save encrypted .passport file \u2014 the sovereign way','Enregistrer un fichier .passport chiffr\u00e9 \u2014 la voie souveraine','Guardar archivo .passport cifrado \u2014 la v\u00eda soberana'],
    ['English \u00b7 EN/FR coming soon','Fran\u00e7ais \u00b7 EN/FR \u00e0 venir','Espa\u00f1ol \u00b7 EN/FR pr\u00f3ximamente'],
    ['Your Passport Address','Votre adresse de Passeport','Su direcci\u00f3n de Pasaporte'],
    ['Passport Address','Adresse de Passeport','Direcci\u00f3n de Pasaporte'],
    ['My Passport Address','Mon adresse de Passeport','Mi direcci\u00f3n de Pasaporte'],
    ['Direct transfer not yet implemented.','Transfert direct pas encore disponible.','Transferencia directa a\u00fan no disponible.'],
    ['15-minute encrypted relay link','Lien relais chiffr\u00e9 de 15 minutes','Enlace rel\u00e9 cifrado de 15 minutos'],
    ['checking\u2026','v\u00e9rification\u2026','comprobando\u2026'],
    ['Personal note (optional)','Note personnelle (facultatif)','Nota personal (opcional)'],
    ['Short description','Description courte','Descripci\u00f3n breve'],
    ['Accepting adds this membership to your passport. It\u2019s up to you to share or not this information.','Accepter ajoute cette adh\u00e9sion \u00e0 votre passeport. \u00c0 vous de partager ou non cette information.','Aceptar a\u00f1ade esta membres\u00eda a su pasaporte. Usted decide si comparte o no esta informaci\u00f3n.'],
    ['Passport assistant \u2014 delegates routine actions','Assistant du Passeport \u2014 d\u00e9l\u00e8gue les actions courantes','Asistente del Pasaporte \u2014 delega las acciones rutinarias'],
    ['Wrong password. Try again.','Mot de passe incorrect. R\u00e9essayez.','Contrase\u00f1a incorrecta. Int\u00e9ntelo de nuevo.'],
    ['Customize your avatar','Personnaliser votre avatar','Personalizar su avatar']
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

  var ORIG = new WeakMap();

  function txt(node) {
    var src;
    if (ORIG.has(node)) { src = ORIG.get(node); }
    else { src = node.nodeValue; ORIG.set(node, src); }
    if (!src || !src.trim()) return;
    var out = xlate(src);
    if (node.nodeValue !== out) node.nodeValue = out;
  }

  function attrs(el) {
    ['placeholder', 'title', 'aria-label'].forEach(function (a) {
      if (!el.getAttribute) return;
      var key = 'data-spid-src-' + a;
      var src = el.getAttribute(key);
      if (src === null) {
        src = el.getAttribute(a);
        if (!src) return;
        el.setAttribute(key, src);
      }
      var out = xlate(src);
      if (el.getAttribute(a) !== out) el.setAttribute(a, out);
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
    lang = l;
    try { localStorage.setItem('spidLang', l); } catch (e) {}
    document.documentElement.lang = l;
    document.documentElement.setAttribute('data-spid-lang', l);
    apply(document.body);
    wire();
    // Durable mirror inside the DID's vault (best effort, may be locked).
    if (typeof global.spidPersistLang === 'function') {
      try { global.spidPersistLang(l); } catch (e) {}
    }
  }

  // Re-render in the vault's stored language, once the vault is known.
  function adopt(l) {
    if (LANGS.indexOf(l) < 0 || l === lang) return;
    lang = l;
    try { localStorage.setItem('spidLang', l); } catch (e) {}
    document.documentElement.lang = l;
    document.documentElement.setAttribute('data-spid-lang', l);
    apply(document.body);
    wire();
  }

  global.spidLang = function () { return lang; };
  global.spidSetLang = setLang;
  global.spidAdoptLang = adopt;
  global.spidApply = apply;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
