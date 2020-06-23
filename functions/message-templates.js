const functions = require('firebase-functions');
const rp = require('request-promise');
const crypto = require('crypto');
const showdown = require('showdown');
const fillTemplate = require('es6-dynamic-template');
const fs = require('fs');
const util = require('util');

const readFile = util.promisify(fs.readFile);

// Transform all headings that represent questions into clickable anchors with a
// chain symbol in front. Filtering out non-ascii characters from anchor names
// makes it bullet-proof.
showdown.extension('header-anchors', function() {
  const chain_svg =
      '<svg aria-hidden="true" class="octicon octicon-link" height="16" version="1.1" viewBox="0 0 16 16" width="16">' +
      '  <path fill-rule="evenodd" d="M4 9h1v1H4c-1.5 0-3-1.69-3-3.5S2.55 3 4 3h4c1.45 0 3 1.69 3 3.5 0 1.41-.91 2.72-2 3.25V8.59c.58-.45 1-1.27 1-2.09C10 5.22 8.98 4 8 4H4c-.98 0-2 1.22-2 2.5S3 9 4 9zm9-3h-1v1h1c1 0 2 1.22 2 2.5S13.98 12 13 12H9c-.98 0-2-1.22-2-2.5 0-.83.42-1.64 1-2.09V6.25c-1.09.53-2 1.84-2 3.25C6 11.31 7.55 13 9 13h4c1.45 0 3-1.69 3-3.5S14.5 6 13 6z"></path>' +
      '</svg>'

  return [{
    type: 'html',
    regex: /<h3 id="([^"]+?)">(.*<\/h3>)/g,
    replace: function(match, p1, p2) {
      // Remove all non-ascii characters from permalinks
      const a = p1.replace(/[^\x00-\x7F]/g, "");
      return `<h3 id="${a}"><a id="user-content-${a}" class="anchor" href="#${a}" aria-hidden="true">${chain_svg}</a>${p2}`;
    }
  }];
});

// Transform email footers so that they appear greyed out.
showdown.extension('email-footers', function() {
  return [{
    type: 'html',
    regex: /<p>(--<br>[\s\S]*)<\/p>/gm,
    replace: '<p style="color: #888">$1</p>'
  }];
});

exports.render = async function(template, params) {
  const baseUrl = 'https://raw.githubusercontent.com/ImmunHelden/ImmunHelden.de/notifications/';
  const template_markdown = await rp.get({ uri: baseUrl + template });

  const match = /# (.*?)\n(.*)/s.exec(template_markdown);
  if (match.length !== 3) {
    console.error('Invalid markdown given. Regex match invalid:', match);
    throw new Error(`Invalid markdown. Plese follow the example here: https://raw.githubusercontent.com/ImmunHelden/ImmunHelden.de/notifications/email/hero_welcome.md`);
  }

  const markdown = fillTemplate(match[2], params);
  const conv = new showdown.Converter({
    extensions: ['email-footers']
  });

  return {
    subject: fillTemplate(match[1], params),
    html: conv.makeHtml(markdown)
  };
}

exports.sendExampleMail = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET") {
    res.status(400).send('Invalid request');
    return;
  }

  try {
    // Render message for preview
    const msg = await exports.render(req.query.template, {
      link_hero_double_opt_in: 'https://immunhelden.de/verifyHero?key=test',
      link_hero_opt_out: 'https://immunhelden.de/deleteHero?key=test',
      prop_org_name: 'Test-Organisation',
      prop_org_login_first_name: 'Test-Vorname',
      link_org_login_double_opt_in: `https://immunhelden.de/verifyOrg?key=test`,
      link_org_login_opt_out: `https://immunhelden.de/deleteOrg?key=test`
    });

    res.send(`
      <link rel="stylesheet" href="https://newcss.net/new.min.css">
      <form action="/doSendExampleMail" method="POST">
        <input type="text" name="template" value="${req.query.template}">
        <input type="password" name="pass" value="" placeholder="Passwort">
        <input type="email" name="email" placeholder="Empfänger E-Mail">
        <input type="submit">
      </form>
      <hr>
      Subject: ${msg.subject}
      <hr>
      ${msg.html}
    `);
  }
  catch (err) {
    res.status(400).send(err.message);
  }
});

exports.doSendExampleMail = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST" || !req.body.pass || !req.body.email || !req.body.template) {
    res.status(400).send('Invalid request');
    return;
  }

  // For now simple security should be sufficient.
  const shasum = crypto.createHash('sha1').update(req.body.pass);
  if (shasum.digest('hex') !== '0ae1588ad4b7568ec2539065fc830cafba9a7d6a') {
    res.status(400).send('Invalid request');
    return;
  }

  try {
    // Render message to send
    const mail = {
      to: req.body.email,
      message: await exports.render(req.body.template, {
        link_hero_double_opt_in: 'https://immunhelden.de/verifyHero?key=test',
        link_hero_opt_out: 'https://immunhelden.de/deleteHero?key=test'
      })
    };

    admin.firestore().collection('mail').add(mail);
    res.send('Ok');
  }
  catch (err) {
    res.status(400).send(err.message);
  }
});

exports.renderFaq = functions.https.onRequest(async (req, res) => {
  const url = 'https://raw.githubusercontent.com/ImmunHelden/ImmunHelden.de/markdown/faq/faq.md';
  const markdown = await rp.get({ uri: url });
  const conv = new showdown.Converter({
    extensions: ['header-anchors']
  });
  conv.setFlavor('github');
  res.send(conv.makeHtml(markdown));
});

const renderUpdateMail = async function(template, updateSeries, recipient) {
  const contents = [];
  for (const ad of recipient.ads) {
    const args = `utm_update=${updateSeries}&utm_range=${recipient.dist}`;
    contents.push(`[${ad.title}: ${ad.address}](https://immunhelden.de/maps/all/?${args}#${ad.id})`);
  }

  return await exports.render(template, {
    prop_ads_distance: `${recipient.dist}km`,
    prop_hero_zip: recipient.zip,
    list_ads: contents.join('<br>'),
    link_hero_opt_out: `https://immunhelden.de/deleteHero?key=${recipient.key}`
  });
}

exports.sendUpdateMails = async function(req, res) {
  if (req.method !== "GET") {
    res.status(400).send('Invalid request');
    return;
  }

  try {
    // Render message for preview
    const msg = await renderUpdateMail(
        req.query.template, 'demo-update', { key: 'demo-key', zip: '12345', dist: 5, ads: [
          { title: 'Anzeige 1', address: 'Adresse 1', id: 'ovgu-expae-t-zellen-studie' },
          { title: 'Anzeige 2', address: 'Adresse 2', id: 'de-drk-nstob-dessau' }
        ]});

    res.send(`
      <link rel="stylesheet" href="https://newcss.net/new.min.css">
      <form action="/immunhelden/us-central1/doSendUpdateMails" method="POST">
        <input type="text" name="template" value="${req.query.template}">
        <input type="password" name="pass" value="" placeholder="Passwort">
        <input type="email" name="email" placeholder="Empfänger E-Mail">
        <input type="submit"><br>
        <label><input type="checkbox" name="heroes" id="heroes"> Wirklich an alle Heroes senden (Achtung echte E-Mails an echte Nutzer)</label>
      </form>
      <hr>
      Subject: ${msg.subject}
      <hr>
      ${msg.html}
    `);
  }
  catch (err) {
    res.status(400).send(err.message);
  }
};

function parseBool(string) {
  if (string) {
    switch (string.toLowerCase().trim()) {
      case "true": case "yes": case "1": case "on":
        return true;
      case "false": case "no": case "0": case "off": case null:
        return false;
      default:
        return Boolean(string);
    }
  }
  return false;
}

exports.doSendUpdateMails =  async function(req, res, admin) {
  if (req.method !== "POST" || /*!req.body.pass ||*/ !req.body.template) {
    res.status(400).send('Invalid request');
    return;
  }
  if (parseBool(req.body.heroes) === (req.body.email.length > 0)) {
    res.status(400).send('Invalid request: Can only send to given email or to heroes. Please make a choice!');
    return;
  }

  // For now simple security should be sufficient.
  const shasum = crypto.createHash('sha1').update(req.body.pass);
  if (shasum.digest('hex') !== '0ae1588ad4b7568ec2539065fc830cafba9a7d6a') {
    res.status(400).send('Bad credentials');
    return;
  }

  const candidates = [];
  const heroes = await admin.firestore().collection('heroes').get();
  heroes.forEach(hero => {
    if (hero.get('doubleOptIn')) {
      candidates.push({
        email: hero.get('email'),
        zip: hero.get('zipCode'),
        key: hero.id,
        ads: [],
        dist: 0
      });
    }
  });

  const fetchAdDetails = async (facilities) => {
    const ads = [];
    for (const f in facilities) {
      const record = await admin.firestore().collection(facilities[f].collection).doc(f).get();
      ads.push({
        id: record.id,
        address: record.get('address'),
        title: record.get('title')
      });
    }
    return ads;
  }

  const distNear = 5;
  const distFar = 15;
  const adsCollections = ['plasma2'];
  for (const candidate of candidates) {
    const facilities = await exports.doCalcDistances(admin, candidate.zip, adsCollections, [distNear, distFar]);
    if (Object.keys(facilities).length > 0) {
      // Create subset of facilities that aare near-by.
      const facilitiesNearBy = {};
      for (const id in facilities) {
        if (facilities[id].hasOwnProperty(`${distNear}km`)) {
          facilitiesNearBy[id] = facilities[id];
        }
      }

      // List facilities that are near-by, if there is more than 1.
      // Otherwise list all we found.
      if (Object.keys(facilitiesNearBy).length > 1) {
        candidate.ads = await fetchAdDetails(facilitiesNearBy);
        candidate.dist = distNear;
      } else {
        candidate.ads = await fetchAdDetails(facilities);
        candidate.dist = distFar;
      }
    }
  }

  const recipients = candidates.filter(c => c.ads.length > 0);

  // Send all mails to specified address for debugging
  if (!parseBool(req.body.heroes) || req.body.email.length > 0) {
    for (const r of recipients) {
      r.email = req.body.email;
    }
  }

  try {
    // Render message to send
    for (const recipient of recipients) {
      admin.firestore().collection('mail').add({
        to: 'team@immunhelden.de',
        message: await renderUpdateMail(req.body.template, 'mua', recipient)
      });
    }
    res.send(
      `Sent updates to ${recipients.length} recipients (out of ${candidates.length} candidates)\n`
    );
  }
  catch (err) {
    res.status(400).send(err.message);
  }
};

function haversineMeters(c1, c2) {
  const R = 6371e3; // metres
  const φ1 = c1[0] * Math.PI/180; // φ, λ in radians
  const φ2 = c2[0] * Math.PI/180;
  const Δφ = (c2[0]-c1[0]) * Math.PI/180;
  const Δλ = (c2[1]-c1[1]) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = Math.round(R * c / 1000); // in kilo-metres

  //console.log(c1, '=>', c2, `= ${d}km`);
  return d;
}

exports.doCalcDistances = async function(admin, fromZip, toCollections, distRanges) {
  try {
    const zip2latlng = JSON.parse(await readFile('zip2latlng.json'));
    if (!zip2latlng.hasOwnProperty(fromZip)) {
      console.log('Cannot find', fromZip);
      return [];
    }

    const results = {};
    const incr = (facility, type, range) => {
      results[facility] = results[facility] || { collection: type };
      if (results[facility].hasOwnProperty(range)) {
        results[facility][range]++;
      } else {
        results[facility][range] = 1;
      }
    };

    const fromCoord = zip2latlng[fromZip];

    for (const type of toCollections) {
      const collection = await admin.firestore().collection(type).get();
      collection.forEach(doc => {
        const geoPoint = doc.get('latlng');
        if (geoPoint.latitude && geoPoint.longitude) {
          const dist = haversineMeters(fromCoord, [geoPoint.latitude, geoPoint.longitude]);
          for (const range of distRanges) {
            if (dist <= range) {
              incr(doc.id, type, range + "km");
              break;
            }
          }
        }
      });
    }
    return results;
  }
  catch (err) {
    console.error(`Error calculating distances from ZIP ${fromZip}:`, err);
  }
}
