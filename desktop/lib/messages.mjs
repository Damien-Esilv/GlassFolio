/**
 * The few native messages shown before the app itself can render (the window is empty if the local server
 * cannot start). Everything else is rendered by the web app, in the user's language, through i18n.
 */
const MESSAGES = {
  en: {
    startFailed: 'GlassFolio could not start its local server.',
    portsBusy: 'No free local port was found (3790 to 3799). Close the other application using them and try again.',
    serverStopped: 'The local server stopped unexpectedly. GlassFolio will close; your data is safe.',
  },
  fr: {
    startFailed: 'GlassFolio n’a pas pu démarrer son serveur local.',
    portsBusy: 'Aucun port local libre n’a été trouvé (3790 à 3799). Fermez l’autre application qui les utilise puis réessayez.',
    serverStopped: 'Le serveur local s’est arrêté de façon inattendue. GlassFolio va se fermer ; vos données sont en sécurité.',
  },
};

export const messagesFor = (locale) => MESSAGES[String(locale).toLowerCase().startsWith('fr') ? 'fr' : 'en'];
