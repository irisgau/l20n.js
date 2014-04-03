'use strict';

/* jshint -W104 */
/* global Locale, Context, rePlaceables */
/* global loadINI */
/* global translateFragment, localizeElement */
/* global getTranslatableChildren, getL10nAttributes */

var DEBUG = false;
var isPretranslated = false;
var rtlList = ['ar', 'he', 'fa', 'ps', 'ur'];

// Public API

navigator.mozL10n = {
  ctx: new Context(),
  get: function get(id, ctxdata) {
    return navigator.mozL10n.ctx.get(id, ctxdata);
  },
  localize: function localize(element, id, args) {
    return localizeElement.call(navigator.mozL10n, element, id, args);
  },
  translate: function translate(element) {
    return translateFragment.call(navigator.mozL10n, element);
  },
  ready: function(callback) {
    return navigator.mozL10n.ctx.ready(callback);
  },
  get readyState() {
    return navigator.mozL10n.ctx.isReady ? 'complete' : 'loading';
  },
  language: {
    set code(lang) {
      navigator.mozL10n.ctx.requestLocales(lang);
    },
    get code() {
      return navigator.mozL10n.ctx.supportedLocales[0];
    },
    get direction() {
      return getDirection(navigator.mozL10n.ctx.supportedLocales[0]);
    }
  },
  _getInternalAPI: function() {
    return {
      Context: Context,
      Locale: Locale,
      rePlaceables: rePlaceables,
      getTranslatableChildren:  getTranslatableChildren,
      getL10nAttributes: getL10nAttributes,
      loadINI: loadINI,
      fireLocalizedEvent: fireLocalizedEvent
    };
  }
};

if (DEBUG) {
  navigator.mozL10n.ctx.addEventListener('error', console.error);
  navigator.mozL10n.ctx.addEventListener('warning', console.warn);
}

function getDirection(lang) {
  return (rtlList.indexOf(lang) >= 0) ? 'rtl' : 'ltr';
}

var readyStates = {
  'loading': 0,
  'interactive': 1,
  'complete': 2
};

function waitFor(state, callback) {
  state = readyStates[state];
  if (readyStates[document.readyState] >= state) {
    callback();
    return;
  }

  document.addEventListener('readystatechange', function l10n_onrsc() {
    if (readyStates[document.readyState] >= state) {
      document.removeEventListener('readystatechange', l10n_onrsc);
      callback();
    }
  });
}

if (window.document) {
  isPretranslated = (document.documentElement.lang === navigator.language);

  // this is a special case for netError bug; see https://bugzil.la/444165
  if (document.documentElement.dataset.noCompleteBug) {
    pretranslate.call(navigator.mozL10n);
    return;
  }


  if (isPretranslated) {
    waitFor('complete', function() {
      window.setTimeout(initResources.bind(navigator.mozL10n));
    });
  } else {
    if (document.readyState === 'complete') {
      window.setTimeout(initResources.bind(navigator.mozL10n));
    } else {
      waitFor('interactive', pretranslate.bind(navigator.mozL10n));
    }
  }

}

function pretranslate() {
  /* jshint -W068 */
  if (inlineLocalization.call(this)) {
    waitFor('interactive', (function() {
      window.setTimeout(initResources.bind(this));
    }).bind(this));
  } else {
    initResources.call(this);
  }
}

function inlineLocalization() {
  var script = document.documentElement
                       .querySelector('script[type="application/l10n"]' +
                       '[lang="' + navigator.language + '"]');
  if (!script) {
    return false;
  }

  var locale = this.ctx.getLocale(navigator.language);
  // the inline localization is happenning very early, when the ctx is not
  // yet ready and when the resources haven't been downloaded yet;  add the
  // inlined JSON directly to the current locale
  locale.addAST(JSON.parse(script.innerHTML));
  // localize the visible DOM
  var l10n = {
    ctx: locale,
    language: {
      code: locale.id,
      direction: getDirection(locale.id)
    }
  };
  translateFragment.call(l10n);
  // the visible DOM is now pretranslated
  isPretranslated = true;
  return true;
}

function initResources() {
  var resLinks = document.head
                         .querySelectorAll('link[type="application/l10n"]');
  var iniLinks = [];
  var link;

  for (link of resLinks) {
    var url = link.getAttribute('href');
    var type = url.substr(url.lastIndexOf('.') + 1);
    if (type === 'ini') {
      iniLinks.push(url);
    }
    this.ctx.resLinks.push(url);
  }

  var iniLoads = iniLinks.length;
  if (iniLoads === 0) {
    initLocale.call(this);
    return;
  }

  function onIniLoaded(err) {
    if (err) {
      this.ctx._emitter.emit('error', err);
    }
    if (--iniLoads === 0) {
      initLocale.call(this);
    }
  }

  for (link of iniLinks) {
    loadINI.call(this, link, onIniLoaded.bind(this));
  }
}

function initLocale() {
  this.ctx.ready(onReady.bind(this));
  this.ctx.requestLocales(navigator.language);
  // mozSettings won't be required here when https://bugzil.la/780953 lands
  if (navigator.mozSettings) {
    navigator.mozSettings.addObserver('language.current', function(event) {
      navigator.mozL10n.language.code = event.settingValue;
    });
  }
}

function onReady() {
  if (!isPretranslated) {
    this.translate();
  }
  isPretranslated = false;

  fireLocalizedEvent.call(this);
}

function fireLocalizedEvent() {
  var event = document.createEvent('Event');
  event.initEvent('localized', false, false);
  event.language = this.ctx.supportedLocales[0];
  window.dispatchEvent(event);
}
