/**
 * Brand logos of known merchants (Epic E52), from the Simple Icons set (CC0) bundled with the app: no key, no
 * request, the same in the online app, Docker and the desktop app. Its updates arrive with the dependency.
 *
 * Matching is deliberately strict, to never show a wrong logo: a curated alias must be the START of the merchant's
 * name, whole words only, once the bank's noise (CARTE 12/03, PRLV SEPA, dates, numbers) is removed. The longest
 * alias wins ("UBER EATS" before "UBER"). A brand missing from the set (TotalEnergies, Free, Amazon…) keeps its
 * initials rather than a look-alike. Loaded on demand with the cash flow.
 */
import {
    siAirbnb, siAirfrance, siAldinord, siAnthropic, siApple, siAuchan, siBinance, siBookingdotcom, siBoulanger,
    siBurgerking, siCarrefour, siCastorama, siCitroen, siCoinbase, siDarty, siDeezer, siDeliveroo, siDropbox,
    siEasyjet, siEbay, siEdotleclerc, siEtsy, siFnac, siFranprix, siGoogle, siHandm, siIkea, siIntermarche,
    siJusteat, siKfc, siKlm, siLeroymerlin, siLidl, siLufthansa, siLydia, siMcdonalds, siMonoprix, siN26,
    siNetflix, siNotion, siOrange, siOvh, siPatreon, siPaypal, siPeugeot, siPicardsurgeles, siPlaystation,
    siRenault, siRevolut, siRyanair, siShell, siSncf, siSpotify, siStarbucks, siSteam, siTesla, siTwitch, siUber,
    siUbereats, siUbisoft, siUniqlo, siVeepee, siVinted, siWise, siYoutube, siZara, siAliexpress,
} from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';
import { normalizeText } from './text';

export interface MerchantLogo {
    title: string;
    /** SVG path on a 24 × 24 box */
    path: string;
    /** Brand colour, 6 hex digits without "#" */
    hex: string;
}

/** Statement spellings (normalised) of each brand. Add a brand only when its logo is the one on the statement. */
const ALIASES: ReadonlyArray<readonly [SimpleIcon, readonly string[]]> = [
    [siCarrefour, ['CARREFOUR']],
    [siEdotleclerc, ['E LECLERC', 'LECLERC']],
    [siLidl, ['LIDL']],
    [siAuchan, ['AUCHAN']],
    [siIntermarche, ['INTERMARCHE']],
    [siMonoprix, ['MONOPRIX']],
    [siFranprix, ['FRANPRIX']],
    // Aldi in France is the Aldi Nord group
    [siAldinord, ['ALDI']],
    [siPicardsurgeles, ['PICARD']],
    [siFnac, ['FNAC']],
    [siDarty, ['DARTY']],
    [siBoulanger, ['BOULANGER']],
    [siIkea, ['IKEA']],
    [siLeroymerlin, ['LEROY MERLIN']],
    [siCastorama, ['CASTORAMA']],
    [siSncf, ['SNCF']],
    [siUbereats, ['UBER EATS', 'UBEREATS']],
    [siUber, ['UBER']],
    [siDeliveroo, ['DELIVEROO']],
    [siJusteat, ['JUST EAT']],
    [siNetflix, ['NETFLIX']],
    [siSpotify, ['SPOTIFY']],
    [siDeezer, ['DEEZER']],
    [siApple, ['APPLE COM', 'APPLE']],
    [siGoogle, ['GOOGLE']],
    [siYoutube, ['YOUTUBE']],
    [siOrange, ['ORANGE']],
    [siShell, ['SHELL']],
    [siAirfrance, ['AIR FRANCE']],
    [siAirbnb, ['AIRBNB']],
    [siBookingdotcom, ['BOOKING COM', 'BOOKING']],
    [siEasyjet, ['EASYJET']],
    [siRyanair, ['RYANAIR']],
    [siLufthansa, ['LUFTHANSA']],
    [siKlm, ['KLM']],
    [siZara, ['ZARA']],
    [siHandm, ['H M', 'H ET M']],
    [siUniqlo, ['UNIQLO']],
    [siPaypal, ['PAYPAL']],
    [siRevolut, ['REVOLUT']],
    [siLydia, ['LYDIA']],
    [siN26, ['N26']],
    [siWise, ['WISE']],
    [siMcdonalds, ['MCDONALDS', 'MC DONALDS', 'MCDONALD S']],
    [siBurgerking, ['BURGER KING']],
    [siKfc, ['KFC']],
    [siStarbucks, ['STARBUCKS']],
    [siVinted, ['VINTED']],
    [siVeepee, ['VEEPEE']],
    [siEbay, ['EBAY']],
    [siEtsy, ['ETSY']],
    [siAliexpress, ['ALIEXPRESS']],
    [siSteam, ['STEAMGAMES', 'STEAM']],
    [siPlaystation, ['PLAYSTATION']],
    [siUbisoft, ['UBISOFT']],
    [siTwitch, ['TWITCH']],
    [siPatreon, ['PATREON']],
    [siNotion, ['NOTION']],
    [siDropbox, ['DROPBOX']],
    [siOvh, ['OVH']],
    [siAnthropic, ['ANTHROPIC', 'CLAUDE AI']],
    [siBinance, ['BINANCE']],
    [siCoinbase, ['COINBASE']],
    [siTesla, ['TESLA']],
    [siRenault, ['RENAULT']],
    [siPeugeot, ['PEUGEOT']],
    [siCitroen, ['CITROEN']],
];

/** Every alias with its logo, the longest first so the most precise one wins. */
const INDEX: ReadonlyArray<{ alias: string; logo: MerchantLogo }> = ALIASES
    .flatMap(([icon, aliases]) => aliases.map(alias => ({ alias, logo: { title: icon.title, path: icon.path, hex: icon.hex } })))
    .sort((a, b) => b.alias.length - a.alias.length);

/** Words the bank puts before the merchant, and that never name one. */
const LEADING_NOISE = /^(?:(?:PAIEMENT|PAR|CARTE|CB|ACHAT|PRLV|PRELEVEMENT|SEPA|VIR|VIREMENT|INST|RECU|EMIS|PERMANENT|ECHEANCE|FACTURE|DE|DU|VERS|POUR|X+\d+|\d+)\s+)+/;

/** The logo of a merchant label (raw or display), or undefined when it is not certain. */
export function findMerchantLogo(label: string): MerchantLogo | undefined {
    const name = normalizeText(label).replace(LEADING_NOISE, '');
    if (!name) return undefined;
    const padded = `${name} `;
    return INDEX.find(entry => padded.startsWith(`${entry.alias} `))?.logo;
}
