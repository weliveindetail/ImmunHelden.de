const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const rp = require('request-promise');
const fs = require('fs');
admin.initializeApp();

// CORS Express middleware to enable CORS Requests.
const cors = require('cors')({
  origin: true,
});

const immuneHeroesTable = '/immuneHeroes'
const stakeHoldersTable = '/stakeHolders'


function toBool(string) {
  if (string) {
    switch (string.toLowerCase().trim()) {
      case "true": case "yes": case "1": case "on": return true;
      case "false": case "no": case "0": case "off": case null: return false;
      default: return Boolean(string);
    }
  }
  return false;
}


exports.addImmuneHero = functions.https.onRequest(async (req, res) => {
  const preName = req.query.preName
  const lastName = req.query.lastName
  const emailAddress = req.query.emailAddress
  const zipCode = parseInt(req.query.zipCode)
  const emailCategory = req.query.emailCategory
  const result = await admin.database().ref(immuneHeroesTable).push({ preName: preName, lastName: lastName, emailAddress: emailAddress, zipCode: zipCode, emailCategory: emailCategory});
  res.redirect('../generic.html');
});

exports.submitHeldenInfo = functions.https.onRequest(async (req, res) => {
  // Check for POST request
  if (req.method !== "POST") {
    res.status(400).send('Please send a POST request');
    return;
  }

  res.send('Eintrag ' + req.body.key + ': available ' + req.body.availability + ' and status ' + req.body.status);
});

exports.addStakeHolder = functions.https.onRequest(async (req, res) => {
  const address = req.query.address;
  const zipCode = req.query.zipCode;
  const city = req.query.city;
  const country = "Germany";

  // LocationIQ query
  const baseUrl = "https://eu1.locationiq.com/v1/search.php";
  const params = {
    key: "pk.861b8037ac48a2b23d05c90e89658064",
    format: "json",
    q: [address, zipCode, city, country].join(',')
  };

  // LocationIQ request with retry
  const requestLatLng = async (maxAttempts, retryDelay) => {
    console.log(`Requesting: ${baseUrl}?key=${params.key}&format=${params.format}&q=${params.q}`);
    const STATUS_CODE_RATE_LIMIT_EXCEEDED = 429;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await rp.get({ uri: baseUrl, qs: params, json: true });
      } catch (err) {
        console.log(err);
        if (err.statusCode === STATUS_CODE_RATE_LIMIT_EXCEEDED) {
          // Our free LocationIQ account has a rate limit and it may kick in
          // when multiple users register at the same time. We will have to pay
          // for the service in order to avoid that. For now log a warning and
          // retry.
          console.warn('Failed to resolve coordinates. Will try again in ' +
                        retryDelay + 'ms.');
          await new Promise((wakeup, _) => setTimeout(wakeup, retryDelay));
        } else {
          console.error(err);
          throw err;
        }
      }
    }

    // We cannot let the user wait forever..
    // TODO: Forward users to a "Try again later page".
    throw new Error(
      'Give up trying to resolve coordinates for address after ' +
      maxAttempts + ' attempts over ' + (maxAttempts * retryDelay / 1000) +
      ' seconds.');
  };

  // LocationIQ response validation
  const hasValidLatLngMatch = (matches) => {
    return matches.hasOwnProperty("length") && matches.length > 0 &&
           matches[0].hasOwnProperty("lat") && matches[0].hasOwnProperty("lon");
  };

  // Kick-off request to LocationIQ and process result.
  const bestMatch = await requestLatLng(10, 500)
    .then(response => {
      if (!hasValidLatLngMatch(response))
        throw new Error(`Invalid response: ${response}`);

      return {
        "lat": parseFloat(response[0].lat),
        "lon": parseFloat(response[0].lon)
      };
    });

  console.log("Best match:", bestMatch);

  // Add record to database
  const entry = {
    "preName": req.query.preName,
    "lastName": req.query.lastName,
    "organisation": req.query.organisation,
    "text": req.query.text,
    "emailAddress": req.query.emailAddress,
    "phoneNumber": req.query.phoneNumber,
    "address": address,
    "zipCode": zipCode,
    "city": city,
    "latitude": bestMatch.lat,
    "longitude": bestMatch.lon,
    "showOnMap": false
  };

  // Organizations -> opt-out from display on map
  // Private person -> opt-in to display on map
  const addToMapDefault = (req.query.organisation.length > 0) ? "true" : "false";

  // TODO: For security reasons the key for adjustment should time out!
  const result = await admin.database().ref(stakeHoldersTable).push(entry);
  const qs = [ 'key=' + result.key, 'lat=' + bestMatch.lat, 'lng=' + bestMatch.lon,
               'map-opt-out=' + addToMapDefault ];

  // Let the user verify and adjust the exact pin location.
  res.redirect('../verifyStakeholderPin.html?' + qs.join('&'));
});

exports.doneVerifyStakeholderPin = functions.https.onRequest(async (req, res) => {
  // TODO: Check the key didn't time out yet!
  const updates = {};
  const key = req.query.key;
  updates[`/stakeHolders/${key}/latitude`] = parseFloat(req.query.exact_lat);
  updates[`/stakeHolders/${key}/longitude`] = parseFloat(req.query.exact_lng);
  updates[`/stakeHolders/${key}/directContact`] = toBool(req.query.show_on_map);

  // Update database record with confirmed exact pin location.
  admin.database().ref().update(updates);
  res.redirect("../generic.html");
});

// exports.getImmuneHeroesInZipCodeRangeAsJson = functions.https.onRequest(async (req, res) => {
//   const searchZipCode = parseInt(req.query.searchZipCode)
//   const result = await getImmuneHeroesInZipCodeRange(searchZipCode)
//   res.json(result.toJSON()).send();
// });

const DEMO_STAKEHOLDERS = {
  "-M3kqEGlGPS4VXKtwmFq" : {
    "address" : "Oberstdorfer Str. 20 ",
    "city" : "Sonthofen",
    "emailAddress" : "a@b.c",
    "lastName" : "Jole",
    "latitude" : 47.50745779304866,
    "longitude" : 10.274544954299929,
    "organisation" : "Alpenland Pflege- und Altenheim",
    "phoneNumber" : "0123456789",
    "preName" : "Jan",
    "directContact": true,
    "text" : "Das Alpenland Pflege- und Altenheim bietet alten Menschen qualifizierte Pflege und Begleitung in 28 Häusern an. Nach dem krankheitsbedingten Ausfall mehrerer Mitarbeiter suchen wir zum nächstmöglichen Termin fünf Aushilfekräfte. Um eine lebensgefährliche Ansteckung unserer Senioren zu vermeiden, bevorzugen wir Personen die die COVID-19 Erkrankung bereits überwunden haben und damit immun sind gegen das neuartige  Corona-Virus.\r\n\r\nSie sind im interdisziplinären Team verantwortlich für:\r\n• Begleitung der Bewohner/innen in ihrer individuellen Lebens- und Alltagsgestaltung entsprechend den jeweiligen Wünschen und Bedarfen\r\n• Unterstützung in der Gestaltung des privaten Umfeldes wie Wohnlichkeit, Aufräumarbeiten Pflege, Wäsche und Reinigung\r\n• Service und Moderation bei den Mahlzeiten\r\n• Ergänzendes Zubereiten von Mahlzeitenkomponenten gemeinsam mit den Bewohner/innen als tagesstrukturierende Angebote\r\n• Durchführung von grundpflegerischen Maßnahmen",
    "zipCode" : "87527"
  },
  "-M3l2nqBPHCGTyGd43RL" : {
    "address" : "Eisenbahnstraße 27",
    "city" : "Leipzig",
    "emailAddress" : "a@b.c",
    "lastName" : "Henning",
    "latitude" : 51.3460671,
    "longitude" : 12.3989616,
    "organisation" : "East Organic Bioladen",
    "phoneNumber" : "0123456789",
    "preName" : "Hans",
    "directContact": true,
    "text" : "Unser Bioladen ist seit Jahren ein beliebter Treffpunkt in der Eisenbahnstraße. Seit Beginn der Corona Pandemie ist den meisten Kunden zwar die Lust am längeren Verweilen vergangen, doch zum Einkaufen besuchen sie uns immer noch genauso oft wie früher.\r\n\r\nUm Infektionsrisiko für unsere Kunden minimieren, möchten wir sobald wie möglich alle Kassenschichten an ImmunHelden abgeben.\r\n\r\nNeben einer fairen Bezahlung bekommt ihr die Möglichkeit in unserem Laden zu Mitarbeiterkonditionen selbst einzukaufen. Bei Interesse meldet euch gern bei uns, dann wir klären alles Weitere.",
    "zipCode" : "04315"
  },
  "-M3l5s6sP2Jv42nq16rl" : {
    "address" : "Sebastian-Bach-Straße 51",
    "city" : "Leipzig",
    "emailAddress" : "a@b.c",
    "lastName" : "Konrad",
    "latitude" : 51.33313703172817,
    "longitude" : 12.35391676425934,
    "organisation" : "Senioren-Wohnpark Stadtpalais",
    "phoneNumber" : "0123456789",
    "preName" : "Karl",
    "directContact": false,
    "text" : "Für die Betreuung gesunder Risikoklienten in unserer Pflegeeinrichtung im Bachviertel suchen wir ab sofort drei zusätzliche Mitarbeiter. Krankheitsbedingte Ausfälle haben in den letzten Wochen zu einem ständigen Wechsel unter unseren Mitarbeitern geführt und das erschwert den Alltag für alle zunehmend.\r\n\r\nWir hoffen dass durch die Beschäftigung von ImmunHelden in unserer Einrichtung wieder mehr Ruhe und Stetigkeit einkehrt.\r\n\r\nAlle immunen Hilfskräfte bekommen dieselbe Vergütung wie unsere angestellten Mitarbeiter. Bitte melden Sie sich bei Interesse umgehend, um weitere Details zu klären.",
    "zipCode" : "04109"
  },
  "-M3mVHBAWkbnuve2C4SC" : {
    "address" : "Prager Str. 13 ",
    "city" : "Leipzig",
    "emailAddress" : "a@b.c",
    "lastName" : "Meinhardt",
    "latitude" : 51.3318815,
    "longitude" : 12.3953362,
    "organisation" : "DRK-Blutspendedienst Nord-Ost",
    "phoneNumber" : "0123456789",
    "preName" : "Maria",
    "directContact" : false,
    "text" : "Wir suchen ab sofort ImmunHelden für eine Studie zum Wirksamkeitsnachweis der Blutplasmaspende für schwer Erkrankte. Für Sie handelt es sich um eine gewöhnliche Blutplasmaspende. Eine Aufwandsentschädigung kann in gleicher Höhe ausgezahlt werden.\r\n\r\nBitte melden Sie sich bei Interesse telefonisch um einen Termin zu vereinbaren. Vielen Danke für Ihre Mithilfe!",
    "zipCode" : "04103"
  },
  "-M3mY_6ZBcxv9ogclXsg" : {
    "address" : "Liebigstraße 20",
    "city" : "Leipzig",
    "emailAddress" : "a@b.c",
    "lastName" : "Noldern",
    "latitude" : 51.32988560475346,
    "longitude" : 12.387095689773561,
    "organisation" : "Universitätsklinikum",
    "phoneNumber" : "0123456789",
    "preName" : "Norman",
    "directContact": true,
    "text" : "Wir suchen dringend ImmunHelden als Helfer auf allen Corona Stationen. Erfahrung in einem medizinischen Beruf ist wünschenswert, aber keine Voraussetzung. Neben der direkten medizinischen Assistenz, gibt es viele Aufgaben die zu erledigen sind und ein Ansteckungsrisiko für unser Fachpersonal birgt.\r\n\r\nDie Unterstützung durch ImmunHelden gibt uns die Möglichkeit verbleibende Schutzausrüstung und Fachpersonal auf die Intensivstationen zu konzentrieren.\r\n\r\nEine Vergütung können wir bis dato nicht garantieren, aber wir setzten uns derzeit auf allen Ebenen für die Beschaffung der nötigen Mittel ein.",
    "zipCode" : "04103"
  },
  "-M3mc9gm-2_nbvIwKrzT" : {
    "address" : "Tschaikowskistraße 28",
    "city" : "Leipzig",
    "emailAddress" : "a@b.c",
    "lastName" : "Olsen",
    "latitude" : 51.346096163595845,
    "longitude" : 12.36015558242798,
    "organisation" : "Kita \"Rosentalzwerge\"",
    "phoneNumber" : "0123456789",
    "preName" : "Ole",
    "directContact": true,
    "text" : "Unsere Kita organisiert die Notbetreuung für das Zentrum-Nordwest. Da wir das Betreuungsangebot unter allen Umständen aufrechterhalten müssen, suchen wir 3 ImmunHelden die April als Springer ab Mitte kurzfristig einspringen können.\r\n\r\nDie Tätigkeit erfordert ein hohes Maß an Verantwortung. Erfahrung beim Umgang mit Kleinkindern ist notwendig!\r\n\r\nEine provisorische Einarbeitungswoche beginnt am Montag den 13. April. Die Anwesenheitszeiten während der Einarbeitungswoche können wir flexibel planen. Alle Arbeitsstunden werden zum regulären Satz vergütet.",
    "zipCode" : "04105"
  },
  "-M3mfJWxi9DMHVHJOOUz" : {
    "address" : "Jordanstraße 5A",
    "city" : "Leipzig",
    "emailAddress" : "a@b.c",
    "lastName" : "Petersen",
    "latitude" : 51.33243323827341,
    "longitude" : 12.323157191276552,
    "organisation" : "Leipziger Tafel e.V.",
    "phoneNumber" : "0123456789",
    "preName" : "Paula",
    "directContact": true,
    "text" : "Viele Menschen die auf das Angebot der Tafeln angewiesen sind gehören gleichzeitig auch zu den Gruppen in unserer Gesellschaft mit dem höchsten Risiko im Falle einer Corona Erkrankung.\r\n\r\nWir suchen ab sofort 5 ImmunHelden als ehrenamtliche Helfer für die Verteilung von Lebensmitteln. Durch Ihre Mithilfe erweisen Sie der Gesellschaft einen hohen Dienst, indem Sie sowohl unsere Mitarbeiter schützen und damit das Angebot der Tafeln sichern und gleichzeitig das Risiko einer Infektion für unsere Klienten minimieren. Bitte melden Sie sich bei Interesse unter der angegebenen E-Mail Adresse.",
    "zipCode" : "04177"
  }
//  , "ABCDE" : {
//    latlng: [ 52.526417, 13.376720 ],
//    name: "Charité",
//    address: "Charitépl. 1, 10117 Berlin",
//    website: "charite.de",
//    phoneNumber: "030 45050"
//  }
};

const DEMO_HEROES = {
  "-M3l6eqWaXOS1cF87OTQ" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Aller",
    "preName" : "Aaron",
    "zipCode" : "04315"
  },
  "-M3l7gQOTb0crfvz5aLN" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Brämer",
    "preName" : "Bert",
    "zipCode" : "04103"
  },
  "-M3l8GxpHehFl3Gyklfz" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Crimm",
    "preName" : "Carola",
    "zipCode" : "04275"
  },
  "-M3l8jY4yRAEYWaVosu4" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Dimmer",
    "preName" : "Daniel",
    "zipCode" : "04564"
  },
  "-M3lGgU0aRauVbd0HMKB" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Ebert",
    "preName" : "Enno",
    "zipCode" : "90762"
  },
  "-M3lGoUQhiVxfBTwb15W" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Fertig",
    "preName" : "Florian",
    "zipCode" : "90475"
  },
  "-M3lHJzFRPwOVgUGQgum" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Gut",
    "preName" : "Gerd",
    "zipCode" : "90518"
  },
  "-M3lHSx_GCMp83TH1kW5" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Heinz",
    "preName" : "Hans",
    "zipCode" : "90518"
  },
  "-M3lHrkCPdf5vH6idhay" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Inmaz",
    "preName" : "Ingo",
    "zipCode" : "81735"
  },
  "-M3lI7lWvdUZ-fesBOHe" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "Jelbi",
    "preName" : "Jonas",
    "zipCode" : "81735"
  },
  "-M3lITFJcc7w7FWws0HZ" : {
    "emailAddress" : "a@b.c",
    "emailCategory" : "direct",
    "lastName" : "König",
    "preName" : "Karl",
    "zipCode" : "85521"
  }
};


exports.pin_locations = functions.https.onRequest(async (req, res) => {
  // This endpoint supports cross-origin requests.
  return cors(req, res, () => {
    const locations = {}; // Map: ID -> { type, title, latlng }

    for (const key in DEMO_STAKEHOLDERS) {
      const entry = DEMO_STAKEHOLDERS[key];
      if (key === "ABCDE") {
        // test another pin type
        locations[key] = {
          "type": 1,
          "title": entry.name,
          "latlng": entry.latlng
        };
      }
      else {
        locations[key] = {
          "type": 0,
          "title": entry.organisation,
          "latlng": [entry.latitude, entry.longitude]
        };
      }
    }

    res.json(locations).send();
  });
});

exports.regions = functions.https.onRequest(async (req, res) => {
  // This endpoint supports cross-origin requests.
  return cors(req, res, () => {
    const regions = {}; // Map: ZIP -> [ ID, ID, ... ]

    for (const key in DEMO_HEROES) {
      const zip = DEMO_HEROES[key].zipCode;
      if (!regions.hasOwnProperty(zip))
        regions[zip] = [];
      regions[zip].push(key);
    }

    res.json(regions).send();
  });
});

function formatFullAddressHTML(entry) {
  let items = [];
  if (entry.hasOwnProperty("address") && entry.address.length > 0)
    items.push(entry.address);
  if (entry.hasOwnProperty("zipCode") && entry.zipCode.length > 0)
    items.push(entry.zipCode);
  if (entry.hasOwnProperty("city") && entry.city.length > 0)
    items.push(entry.city);
  return items.join(', ');
}

function formatStakeholderDetailsHTML(key, entry) {
  let html = entry.organisation ? `<h2>${entry.organisation}</h2>` : '';

  const addressHTML = formatFullAddressHTML(entry);
  if (addressHTML.length > 0)
    html += `<b>Wo?</b><p>${addressHTML}</p>`;

  const textHTML = entry.text.split(/\r?\n/).join("<br>");
  html += `<b>Was kann ich tun?</b><p>${textHTML}</p>`;

  html += `<b>Kontakt aufnehmen</b>`;
  if (entry.directContact) {
    html += `<p>`;
    html += `✉ <a href="mailto:${entry.emailAddress}">Email</a> `;
    html += `☎ <a href="tel:${entry.phoneNumber}">Telefon</a>`;
    html += `</p>`;
  }
  else {
    html += `<form action="https://immunhelden.de/contactStakeholder" method="POST">`;
    html += `  <input type="hidden" name="key" value="${key}">`;
    html += `  <p>`;
    html += `    Du bleibst vollständig annonym. Deine E-Mail Adresse wird`;
    html += `    nur dafür genutzt dir einmalig einen Zugangslink zu senden,`;
    html += `    sobald du eine Antwort bekommst. `;
    html += `  </p>`;
    html += `  <input type="text" name="contact" placeholder="E-Mail Adresse" required`;
    html += `         style="width: 100%;">`;
    html += `  <p>`;
    html += `    Um deine Identität zu bestätigen, musst du bei jedem Aufruf des Links`;
    html += `    dein Passwort erneut eingeben.`;
    html += `  </p>`;
    html += `  <input type="password" name="password" placeholder="Passwort" required`;
    html += `         style="width: 100%;">`;
    html += `  <p>`;
    html += `    Schreib optional etwas zu deiner Motivation oder Qualifikation und`;
    html += `    wie du genannt werden möchtest.`;
    html += `  </p>`;
    html += `  <textarea name="message" rows="3" placeholder="Sag hallo!"></textarea> `;
    html += `  <input type="text" name="pseudonym" placeholder="Anzeigename"`;
    html += `         style="width: calc(100% - 6rem); margin-top: 1rem;">`;
    html += `  <input type="submit" value="Los"`;
    html += `         style="width: 5rem; float: right; margin-top: 1rem;">`;
    html += `</form>`;
  }

  return `<div id="${key}" style="padding: 0 1rem;">${html}</div>`;
}

exports.details_html = functions.https.onRequest(async (req, res) => {
  // This endpoint supports cross-origin requests.
  return cors(req, res, () => {
    const keys = req.query.ids.split(',');
    const sections = [];
    let heroes = [];

    for (const key of keys) {
      if (key === "ABCDE") {
        let html = ``;
        html += `<div style="margin: 1rem 0;">`;
        html += `  <img src="https://immunhelden.de/images/clinic.png" alt="clinic"`;
        html += `       style="height: 2rem; float: left; margin-right: 5px;">`;
        html += `  <b>Charité</b><br>`;
        html += `  Charitépl. 1, 10117 Berlin`;
        html += `  <p>`;
        html += `    ✉ <a href="https://charite.de">Webseite</a>`;
        html += `    ☎ <a href="tel:03012345">Telefon</a>`;
        html += `  </p>`;
        html += `</div>`;
        sections.push(html);
      }
      else if (DEMO_STAKEHOLDERS.hasOwnProperty(key)) {
        sections.push(formatStakeholderDetailsHTML(key, DEMO_STAKEHOLDERS[key]));
      }
      else if (DEMO_HEROES.hasOwnProperty(key)) {
        heroes.push(key);
      }
      else {
        console.log('Encountered unknown key: ', key);
      }
    }

    let html = '';
    if (sections.length > 0) {
      html += sections.join('<hr>\n');
    }
    if (heroes.length > 0) {
      if (html !== '') {
        html += '<hr>\n';
        console.warn('Details request mixed heroes with stakeholders!', req.query.ids);
      }
      html += '<div id="' + heroes.join("_") + '">';
      html += '<img src="https://immunhelden.de/images/superhero.png" alt="heroes" style="height: 1.2rem;"> ';
      html += '<b style="font-size: 1.5rem; color: #d3303b;">';
      html += heroes.length + ' ImmunHeld:in' + (heroes.length > 1 ? 'nen' : '');
      html += '</b></div>\n';
    }

    res.send(html);
  });
});


exports.contactStakeholder = functions.https.onRequest(async (req, res) => {
  // Check for POST request
  if (req.method !== "POST") {
    res.status(400).send('Please send a POST request');
    return;
  }

  res.send(req.body.contact + ' an ' + req.body.key + ':\n' + req.body.message);
});


exports.getAllImmuneHeroesNutsAsJson = functions.https.onRequest(async (req, res) => {
  const heroesData = await admin.database().ref(immuneHeroesTable).once('value');

  // Load map of zipCode => NUTS_ID, build from CSV data:
  // https://ec.europa.eu/eurostat/web/nuts/correspondence-tables/postcodes-and-nuts
  fs.readFile('zip2nuts.json', 'utf8', (err, data) => {
    if (err) throw err;
    console.log("heroesData: ", heroesData);
    const heroes = { ...DEMO_HEROES, ...heroesData.toJSON() };
    const heroesPerNuts = {};
    const zip2nuts = JSON.parse(data);

    for (const key in heroes) {
      const zip = heroes[key].zipCode;
      if (!zip2nuts.hasOwnProperty(zip)) {
        // TODO: Handle invalid/unknown ZIP codes.
        console.log("Ignore unknown ZIP code:", zip);
        continue;
      }

      const nuts = zip2nuts[zip];
      if (heroesPerNuts.hasOwnProperty(nuts)) {
        heroesPerNuts[nuts] += 1;
      } else {
        heroesPerNuts[nuts] = 1;
      }
    }

    // Load map of NUTS_ID => shape, extracted from:
    // https://datahub.io/core/geo-nuts-administrative-boundaries/r/nuts_rg_60m_2013_lvl_3.geojson
    fs.readFile('nuts_lvl_3_de_by_id.json', 'utf8', (err, data) => {
      if (err) throw err;
      const nutsLvl3 = JSON.parse(data);

      const resp = [];
      for (const nutsId in heroesPerNuts) {
        if (!nutsLvl3.hasOwnProperty(nutsId)) {
          // TODO: Handle invalid/unknown NUTS.
          console.log("Ignore unknown NUTS_ID:", nutsId);
          continue;
        }

        resp.push({
          "shape": nutsLvl3[nutsId][0],
          "users": heroesPerNuts[nutsId]
        });
      }

      res.json(resp).send();
    })
  });
});

exports.getAllStakeHoldersAsJson = functions.https.onRequest(async (req, res) => {
  //const result = await getAllStakeHolders()
  //res.json(result.toJSON()).send();

  // Serve sample data until start of beta.
  res.json(DEMO_STAKEHOLDERS).send();
});

exports.getStakeHoldersInZipCodeRangeAsJson = functions.https.onRequest(async (req, res) => {
  const searchZipCode = parseInt(req.query.searchZipCode)
  const result = await getStakeHoldersInZipCodeRange(searchZipCode)
  res.json(result.toJSON()).send();
});

//exports.getStakeHoldersInZipCodeRangeAsHtmlTable = functions.https.onRequest(async (req, res) => {
//  const searchZipCode = parseInt(req.query.searchZipCode)
//  return res.send(wrapStakeHoldersHtmlTableInBody(await createStakeHoldersInZipCodeRangeHtmlTable(searchZipCode)));
//});

//daily
// exports.scheduledDailyEmailNotificationDaily = functions.pubsub.schedule('every day 16:00')
//   .timeZone('Europe/Berlin')
//   .onRun(async (context) => {
//     const snapshot = await getAllImmuneHeroesWithEmailCategory("daily");
//     snapshot.forEach(childSnapshot => {
//       const immuneHero = getImmuneHeroFromSnapshot(childSnapshot);
//       notifyImmuneHero(immuneHero)
//     })
//     return null;
//   });

// //weekly
// exports.scheduledDailyEmailNotificationWeekly = functions.pubsub.schedule('every monday 09:00')
//   .timeZone('Europe/Berlin')
//   .onRun(async (context) => {
//     const snapshot = await getAllImmuneHeroesWithEmailCategory("weekly");
//     snapshot.forEach(childSnapshot => {
//       const immuneHero = getImmuneHeroFromSnapshot(childSnapshot);
//       notifyImmuneHero(immuneHero)
//     })
//     return null;
//   });

exports.notifyImmuneHeroesInZipCodeRangeOnCreateStakeHolder = functions.database.ref(stakeHoldersTable + '/{pushId}')
  .onCreate(async (newStakeHolderSnapshot, context) => {
    const searchZipCode = parseInt(newStakeHolderSnapshot.val().zipCode)
    const numberStakeHolder = (await getStakeHoldersInZipCodeRange(searchZipCode)).numChildren()
    if (numberStakeHolder > 0) {
      const snapshot = await getImmuneHeroesInZipCodeRange(searchZipCode);
      snapshot.forEach(childSnapshot => {
        const stakeHoldersHtmlTable = createStakeHoldersInZipCodeRangeHtmlTable(searchZipCode);
        const immuneHero = getImmuneHeroFromSnapshot(childSnapshot);
        if (immuneHero.emailCategory === "direct") {
          const success = sendEmailToImmuneHero(immuneHero, stakeHoldersHtmlTable);
        }
      });
      return null;
    } else {
      return null;
    }
  });

//Automatic Email
exports.notifyImmuneHeroOnCreateImmuneHero = functions.database.ref(immuneHeroesTable + '/{pushId}')
  .onCreate(async (newImmuneHeroSnapShot, context) => {
    const searchZipCode = parseInt(newImmuneHeroSnapShot.val().zipCode)
    console.log("Number: " + searchZipCode)
    const numberStakeHolder = (await getStakeHoldersInZipCodeRange(searchZipCode)).numChildren()
    console.log("Number:" + numberStakeHolder)
    if (numberStakeHolder > 0) {
      const stakeHoldersHtmlTable = createStakeHoldersInZipCodeRangeHtmlTable(searchZipCode);
      const immuneHero = getImmuneHeroFromSnapshot(newImmuneHeroSnapShot)
      return sendEmailToImmuneHero(immuneHero, stakeHoldersHtmlTable)
    } else {
      return null;
    }
  });

// Automatic Email Http Request
// exports.notifyImmuneHeroesInZipCodeRange = functions.https.onRequest(async (req, res) => {
//   const searchZipCode = parseInt(req.query.searchZipCode)
//   const numberStakeHolder = (await getStakeHoldersInZipCodeRange(searchZipCode)).numChildren()
//   console.log("Number:" + numberStakeHolder)
//   if (numberStakeHolder > 0) {
//     console.log("Ja")
//     return getImmuneHeroesInZipCodeRange(searchZipCode).then(snapshot => {
//       var successList = "";
//       snapshot.forEach(childSnapshot => {
//         const stakeHoldersHtmlTable = createStakeHoldersInZipCodeRangeHtmlTable(searchZipCode);
//         const immuneHero = getImmuneHeroFromSnapshot(childSnapshot)
//         console.log(immuneHero.emailAddress)
//         const success = sendEmailToImmuneHero(immuneHero, stakeHoldersHtmlTable)
//         if (success) {
//           successList += "Email successfully sent to" + immuneHero.key + "\n"
//         } else {
//           successList += "Email not sent to" + immuneHero.key + "\n"
//         }
//       });
//       return res.send(successList)
//     });
//   } else {
//     return null;
//   }
// });

async function notifyImmuneHero(immuneHero) {
  const searchZipCode = immuneHero.zipCode
  console.log("Number: " + searchZipCode)
  const numberStakeHolder = (await getStakeHoldersInZipCodeRange(searchZipCode)).numChildren()
  console.log("Number:" + numberStakeHolder)
  if (numberStakeHolder > 0) {
    const stakeHoldersHtmlTable = createStakeHoldersInZipCodeRangeHtmlTable(searchZipCode);
    return sendEmailToImmuneHero(immuneHero, stakeHoldersHtmlTable)
  } else {
    return null;
  }
}

async function createStakeHoldersInZipCodeRangeHtmlTable(searchZipCode) {
  const stakeHoldersList = await getStakeHoldersInZipCodeRange(searchZipCode)
  return createStakeHoldersHtmlTable(stakeHoldersList);
}

function createStakeHoldersHtmlTable(stakeHoldersList) {
  var table = "<table><tr><td style='width: 100px; color: red; text-align: left'>Vorname</td>";
  table += "<td style='width: 100px; color: red; text-align: left;'>Nachname</td>";
  table += "<td style='width: 100px; color: red; text-align: left;'>Organisation</td>";
  table += "<td style='width: 100px; color: red; text-align: left;'>Email</td>";
  table += "<td style='width: 100px; color: red; text-align: left;'>Telefonnummer</td>";
  table += "<td style='width: 200px; color: red; text-align: left;'>Was wird benötigt?</td>";
  table += "<td style='width: 100px; color: red; text-align: left;'>Addresse (Einsatzort)</td>";
  table += "<td style='width: 100px; color: red; text-align: left;'>Postleitzahl (Einsatzort)</td>";
  table += "<td style='width: 100px; color: red; text-align: left;'>Stadt (Einsatzort)</td></tr>";

  table += "<tr><td style='width: 100px; text-align: left;'>---------------</td>";
  table += "<td     style='width: 100px; text-align: left;'>---------------</td>";
  table += "<td     style='width: 100px; text-align: left;'>---------------</td>";
  table += "<td     style='width: 100px; text-align: left;'>---------------</td>";
  table += "<td     style='width: 100px; text-align: left;'>---------------</td>";
  table += "<td     style='width: 100px; text-align: left;'>---------------</td>";
  table += "<td     style='width: 100px; text-align: left;'>---------------</td>";
  table += "<td     style='width: 100px; text-align: left;'>---------------</td>";
  table += "<td     style='width: 100px; text-align: left;'>---------------</td></tr>";

  stakeHoldersList.forEach(childSnapshot => {
    const stakeHolder = getStakeHolderFromSnapshot(childSnapshot);
    table += "<tr><td style='width: 100px; text-align: left;'>" + stakeHolder.preName + "</td>";
    table += "<td style='width: 100px; text-align: left;'>" + stakeHolder.lastName + "</td>";
    table += "<td style='width: 100px; text-align: left;'>" + stakeHolder.organisation + "</td>";
    table += "<td style='width: 100px; text-align: left;'>" + stakeHolder.emailAddress + "</td>";
    table += "<td style='width: 100px; text-align: left;'>" + stakeHolder.phoneNumber + "</td>";
    table += "<td style='width: 100px; text-align: left;'>" + stakeHolder.text + "</td>";
    table += "<td style='width: 100px; text-align: left;'>" + stakeHolder.address + "</td>";
    table += "<td style='width: 100px; text-align: left;'>" + stakeHolder.zipCode + "</td>";
    table += "<td style='width: 100px; text-align: left;'>" + stakeHolder.city + "</td></tr>";
  });
  table += "</table>";
  return table;
}

function wrapStakeHoldersHtmlTableInBody(stakeHoldersHtmlTable) {
  var body = "<!doctype html>"
  body += "<html>"
  body += "<title>ImmunHelden</title>"
  body += "</head>"
  body += "<h3>Diese Personen/Organisationen benötigen deine Hilfe:</h3>"
  body += stakeHoldersHtmlTable
  body += "</body>"
  body += "</html>"
  return body;
}

function wrapStakeHoldersHtmlTableInBodyWithImmuneHeroInformation(immuneHero, stakeHoldersHtmlTable) {
  var body = "<!doctype html>"
  body += "<html>"
  body += "<title>ImmunHelden</title>"
  body += "</head>"
  body += "<h3>Hey " + immuneHero.preName + ",</h3>"
  body += "<p>danke, dass Du mit dabei bist!</p>"
  body += "<h4>Diese Personen/Organisationen benötigen gerade deine Hilfe:</h4>"
  body += stakeHoldersHtmlTable
  body += "<p>Bitte melde dich direkt bei Ihnen!</p>"
  body += "<p>Dein ImmunHelden Team</p>"
  body += "</body>"
  body += "</html>"
  return body;
}

function getStakeHolderFromSnapshot(snapshot) {
  return stakeHolder = { key: snapshot.key, preName: snapshot.val().preName, lastName: snapshot.val().lastName, organisation: snapshot.val().organisation, emailAddress: snapshot.val().emailAddress, phoneNumber: snapshot.val().phoneNumber, text: snapshot.val().text, address: snapshot.val().address, zipCode: snapshot.val().zipCode, city: snapshot.val().city }
}

function getAllStakeHolders() {
  return admin.database().ref(stakeHoldersTable).once('value')
}

function getImmuneHeroFromSnapshot(snapshot) {
  return immuneHero = { key: snapshot.key, preName: snapshot.val().preName, lastName: snapshot.val().lastName, emailAddress: snapshot.val().emailAddress, zipCode: snapshot.val().zipCode, emailCategory: snapshot.val().emailCategory }
}

function getAllImmuneHeroesWithEmailCategory(emailCategory) {
  return admin.database().ref(immuneHeroesTable).orderByChild("emailCategory").equalTo(emailCategory).once('value')
}

function getImmuneHeroesInZipCodeRange(searchZipCode) {
  const searchZipCodeBounds = getSearchZipCodeBounds(searchZipCode)
  return admin.database().ref(immuneHeroesTable).orderByChild("zipCode").startAt(searchZipCodeBounds.searchZipCodeLowerBound).endAt(searchZipCodeBounds.searchZipCodeUpperBound).once('value')
}

function getStakeHoldersInZipCodeRange(searchZipCode) {
  const searchZipCodeBounds = getSearchZipCodeBounds(searchZipCode)
  return admin.database().ref(stakeHoldersTable).orderByChild("zipCode").startAt(searchZipCodeBounds.searchZipCodeLowerBound).endAt(searchZipCodeBounds.searchZipCodeUpperBound).once('value')
}

function getSearchZipCodeBounds(searchZipCode) {
  const searchZipCodeLowerBound = searchZipCode - (searchZipCode % 1000)
  const searchZipCodeUpperBound = searchZipCodeLowerBound + 999
  return searchZipCodeBounds = { searchZipCodeLowerBound: searchZipCodeLowerBound, searchZipCodeUpperBound: searchZipCodeUpperBound }
}

//Email
let mailTransport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'immune.heroes@gmail.com',
    pass: ''
  }
});

async function sendEmailToImmuneHero(immuneHero, stakeHoldersHtmlTable) {
  const mailOptions = {
    from: "ImmunHelden",
    to: immuneHero.emailAddress
  };
  mailOptions.subject = 'Hey ImmuneHero: Wir brauchen dich!';
  mailOptions.text = 'Hey ' + immuneHero.preName + ',\n\nWir brauchen deine Unterstützung!\n\nDein ImmunHelden Team';
  mailOptions.html = wrapStakeHoldersHtmlTableInBodyWithImmuneHeroInformation(immuneHero, await stakeHoldersHtmlTable);
  return await mailTransport.sendMail(mailOptions);
}
