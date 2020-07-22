const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fs = require("fs");

admin.initializeApp(functions.config().firebase);

function forwardAdmin(targetFunction) {
  return (req, res) => targetFunction(admin, req, res)
}

// Tools for finding the markdown for our email templates on GitHub, expanding
// placeholders, formatting it as HTML and sending sample mails for tests.
const messageTemplates = require(`./message-templates.js`);
exports.renderFaq = messageTemplates.renderFaq;
exports.sendExampleMail = messageTemplates.sendExampleMail;
exports.doSendExampleMail = messageTemplates.doSendExampleMail;

exports.sendUpdateMails = functions.https.onRequest(messageTemplates.sendUpdateMails);
exports.doSendUpdateMails = functions.https.onRequest(async (req, res) => {
  return await messageTemplates.doSendUpdateMails(req, res, admin);
});

// Tools for processing static data, e.g. from blutspenden.de (internal use only).
const toolsDataImport = require(`./tools-blutspenden-de.js`);
exports.parseBlutspendenDe = toolsDataImport.parse;
exports.renderBlutspendenDe = toolsDataImport.render;

const map = require("./map.js");
exports.all_pin_locations = functions.https.onRequest(forwardAdmin(map.all_pin_locations));
exports.pin_locations = functions.https.onRequest(forwardAdmin(map.pin_locations));
exports.details_html = functions.https.onRequest(forwardAdmin(map.details_html));
exports.regions = functions.https.onRequest((req, res) => {}); // Currently unused

// Import JSON data for plasma locations. Admin use only.
// Uncomment and run locally with service account connected:
//
// % export GOOGLE_APPLICATION_CREDENTIALS=/Users/staefsn/.ssh/immunhelden-b4cf6fd1620c.json
// % firebase serve
//
//(async () => {
//  const baseUrl = 'https://raw.githubusercontent.com/ImmunHelden/ImmunHelden.de/data';
//  await toolsDataImport.importJson(admin, 'locations', 'plasma', `${baseUrl}/blutspenden.de/blutspenden-clean.json`, '4u66EeNFph4dmiGkTUfg');
//  await toolsDataImport.importJson(admin, 'locations', 'plasma', `${baseUrl}/biolife/austria.json`, '4u66EeNFph4dmiGkTUfg');
//  await toolsDataImport.importJson(admin, 'locations', 'stadtmission', `${baseUrl}/stadtmission/de.json`, '4u66EeNFph4dmiGkTUfg');
//  await toolsDataImport.importJson(admin, 'locations', 'tafel', `${baseUrl}/tafel/de.json`, '4u66EeNFph4dmiGkTUfg ');
//})();

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

exports.addImmuneHero = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST" || !parseBool(req.body.datenschutz))
      throw "Invalid request";

    const hero = await admin.firestore().collection("heroes").add({
      email: req.body.email,
      zipCode: req.body.zipCode,
      countryCode: req.body.countryCode,
    });

    // Render E-Mail
    const msg = await messageTemplates.render("email/de/hero_welcome.md", {
      link_hero_double_opt_in: `https://immunhelden.de/confirmImmuneHero?id=${hero.id}`,
      link_hero_opt_out: `https://immunhelden.de/removeImmuneHero?id=${hero.id}`,
    });

    // Trigger E-Mail
    admin.firestore().collection("mail").add({
      to: req.body.email,
      message: msg,
    });

    res.redirect("../?subscribe=singleOptIn");
  } catch (err) {
    console.error(err);
    res.redirect("../?subscribe=fail");
  }
});

exports.verifyHero = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET" || !req.query.key) {
    res.status(400).send("Invalid request");
    return;
  }

  const heroRef = admin.database().ref("/heroes/" + req.query.key);
  heroRef.update({ doubleOptIn: true });

  res.redirect("../generic.html");
});

exports.deleteHero = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET" || !req.query.key) {
    res.status(400).send("Invalid request");
    return;
  }

  const heroRef = admin.database().ref("/heroes/" + req.query.key);
  await heroRef.remove();

  res.send("Subscription deleted");
});

exports.submitHeldenInfo = functions.https.onRequest(async (req, res) => {
  // Check for POST request
  if (req.method !== "POST") {
    res.status(400).send("Please send a POST request");
    return;
  }

  //console.log('Eintrag ' + req.body.key + ': ' + req.body.name + ' available ' + req.body.availability + ' and status ' + req.body.status);

  const key = req.body.key;
  const heroRef = admin.database().ref(`/heroes/${key}`);
  try {
    const heroSnapshot = await heroRef.once("value");
    if (!heroSnapshot) throw new Error(`Unknown heroes key '${key}'`);

    const heroJson = heroSnapshot.toJSON();
    console.log(`About to update HeldenInfo ${key}:`, heroJson);

    const heroRefChanged = heroRef.update({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      availability: req.body.availability,
      frequency: req.body.frequency,
      status: req.body.status,
    });

    res.redirect(`../map.html?registered=${heroJson.zipCode}`);

    await heroRefChanged.then(async () => {
      const updatedSnapshot = await heroRef.once("value");
      console.log(`Done updating HeldenInfo ${key}:`, updatedSnapshot.toJSON());
      return;
    });
  } catch (err) {
    console.error(`Error Message:`, err);
    res.status(400).send("Invalid request. See function logs for details.");
  }
});

exports.addImmuneHeroMap = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST" || !parseBool(req.body.datenschutz))
      throw "Invalid request";

    const hero = await admin.firestore().collection("heroes").add({
      email: req.body.email,
      zipCode: req.body.zipCode,
      countryCode: req.body.countryCode,
    });

    // Render E-Mail
    const msg = await messageTemplates.render("email/de/hero_welcome.md", {
      link_hero_double_opt_in: `https://immunhelden.de/confirmImmuneHero?id=${hero.id}`,
      link_hero_opt_out: `https://immunhelden.de/removeImmuneHero?id=${hero.id}`,
    });

    // Trigger E-Mail
    admin.firestore().collection("mail").add({
      to: req.body.email,
      message: msg,
    });

    res.json({ status: 'ok' });
  }
  catch (err) {
    console.error(err);
    res.status(400).json({ status: 'fail', error: err });
  }
});

exports.addImmuneHeroEU = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST" || !parseBool(req.body.datenschutz))
      throw "Invalid request";

    const hero = await admin.firestore().collection("heroes").add({
      email: req.body.email,
      zipCode: req.body.zipCode,
      countryCode: req.body.countryCode,
    });

    // Render E-Mail
    const msg = await messageTemplates.render("email/en/hero_welcome.md", {
      link_hero_double_opt_in: `https://immunhelden.eu/confirmImmuneHeroEU?id=${hero.id}`,
      link_hero_opt_out: `https://immunhelden.eu/removeImmuneHeroEU?id=${hero.id}`,
    });

    // Trigger E-Mail
    admin.firestore().collection("mail").add({
      to: req.body.email,
      message: msg,
    });

    res.redirect("../?subscribe=singleOptIn");
  } catch (err) {
    console.error(err);
    res.redirect("../?subscribe=fail");
  }
});

exports.confirmImmuneHeroEU = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "GET" || !req.query.hasOwnProperty("id"))
      throw "Invalid request";

    const ref = admin.firestore().collection("heroes").doc(req.query.id);
    const doc = await ref.get();
    if (!doc.exists) throw `Cannot find hero with ID ${req.query.id}`;

    ref.update({ doubleOptIn: true });
    res.redirect("../?subscribe=doubleOptIn");
  } catch (err) {
    console.error(err);
    res.status(400).send(`Error: ${err}`);
  }
});

exports.removeImmuneHeroEU = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "GET" || !req.query.hasOwnProperty("id"))
      throw "Invalid request";

    const ref = admin.firestore().collection("heroes").doc(req.query.id);
    const doc = await ref.get();
    if (!doc.exists) throw `Cannot find hero with ID ${req.query.id}`;

    ref.delete();
    res.redirect("../?subscribe=optOut");
  } catch (err) {
    console.error(err);
    res.status(400).send(`Error: ${err}`);
  }
});

exports.addStakeHolder = functions.https.onRequest(async (req, res) => {
  // Check for POST request
  if (req.method !== "POST") {
    res.status(400).send("Please send a POST request");
    return;
  }

  const address = req.body.address;
  const zipCode = req.body.zipCode;
  const city = req.body.city;
  const country = "Germany";

  // LocationIQ query
  const baseUrl = "https://eu1.locationiq.com/v1/search.php";
  const params = {
    key: "pk.861b8037ac48a2b23d05c90e89658064",
    format: "json",
    q: [address, zipCode, city, country].join(","),
  };

  // LocationIQ request with retry
  const requestLatLng = async (maxAttempts, retryDelay) => {
    console.log(
      `Requesting: ${baseUrl}?key=${params.key}&format=${params.format}&q=${params.q}`
    );
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
          console.warn(
            "Failed to resolve coordinates. Will try again in " +
              retryDelay +
              "ms."
          );
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
      "Give up trying to resolve coordinates for address after " +
        maxAttempts +
        " attempts over " +
        (maxAttempts * retryDelay) / 1000 +
        " seconds."
    );
  };

  // LocationIQ response validation
  const hasValidLatLngMatch = (matches) => {
    return (
      matches.hasOwnProperty("length") &&
      matches.length > 0 &&
      matches[0].hasOwnProperty("lat") &&
      matches[0].hasOwnProperty("lon")
    );
  };

  // Kick-off request to LocationIQ and process result.
  const pendingLocationQuery = requestLatLng(10, 500).then((response) => {
    if (!hasValidLatLngMatch(response))
      throw new Error(`Invalid response: ${response}`);

    return {
      lat: parseFloat(response[0].lat),
      lon: parseFloat(response[0].lon),
    };
  });

  // Add records to database
  const stakeholderRef = await admin.database().ref("/stakeholders").push();
  const accountRef = await admin.database().ref("/accounts").push();
  const postRef = await admin.database().ref("/posts").push();

  // Render verification E-Mail
  const msg = await messageTemplates.render("email/de/org_welcome.md", {
    prop_org_name: req.body.organization,
    prop_org_login_first_name: req.body.firstName,
    link_org_login_double_opt_in: `https://immunhelden.de/verifyOrg?key=${stakeholderRef.key}`,
    link_org_login_opt_out: `https://immunhelden.de/deleteOrg?key=${stakeholderRef.key}`,
  });

  // Trigger verification E-Mail
  admin.firestore().collection("mail").add({
    to: req.body.email,
    message: msg,
  });

  // Fill records in database
  stakeholderRef.set({
    organisation: req.body.organization || "",
    accounts: [accountRef.key],
    posts: [postRef.key],
  });

  accountRef.set({
    stakeholder: stakeholderRef.key,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    phone: req.body.phone,
  });

  // Wait for location.
  const resolvedLocation = await pendingLocationQuery;
  console.log("Best match:", resolvedLocation);

  postRef.set({
    stakeholder: stakeholderRef.key,
    address: address,
    zipCode: zipCode,
    city: city,
    latitude: resolvedLocation.lat,
    longitude: resolvedLocation.lon,
    text: req.body.text,
    showOnMap: false,
  });

  // Forward to verification page.
  // Organizations -> opt-out from display on map
  // Private person -> opt-in to display on map
  const addToMapDefault = req.body.organization.length > 0 ? "true" : "false";
  const qs = [
    "key=" + stakeholderRef.key,
    "lat=" + resolvedLocation.lat,
    "lng=" + resolvedLocation.lon,
    "map-opt-out=" + addToMapDefault,
  ];

  // TODO: For security reasons the key for adjustments should time out!
  res.redirect("../verifyStakeholderPin.html?" + qs.join("&"));
});

exports.doneVerifyStakeholderPin = functions.https.onRequest(
  async (req, res) => {
    // TODO: Check the key didn't time out yet!
    const updates = {};
    const key = req.query.key;
    updates[`/stakeHolders/${key}/latitude`] = parseFloat(req.query.exact_lat);
    updates[`/stakeHolders/${key}/longitude`] = parseFloat(req.query.exact_lng);
    updates[`/stakeHolders/${key}/directContact`] = parseBool(
      req.query.show_on_map
    );

    // Update database record with confirmed exact pin location.
    admin.database().ref().update(updates);
    res.redirect("../generic.html");
  }
);

exports.verifyOrg = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET" || !req.query.key) {
    res.status(400).send("Invalid request");
    return;
  }

  const ref = admin.database().ref("/stakeholders/" + req.query.key);
  ref.update({ doubleOptIn: true });

  res.redirect("../generic.html");
});

exports.deleteOrg = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET" || !req.query.key) {
    res.status(400).send("Invalid request");
    return;
  }

  const ref = admin.database().ref("/stakeholders/" + req.query.key);
  await ref.remove();

  res.send("Subscription deleted");
});

exports.newAccountCreated = functions.auth.user().onCreate((user) => {
  userDoc = { partner: null };
  admin
    .firestore()
    .collection("users")
    .doc(user.uid)
    .set(userDoc)
    .then((writeResult) => {
      console.log("User Created result:", writeResult);
      return;
    })
    .catch((err) => {
      console.log(err);
      return;
    });
});
exports.accountDeleted = functions.auth.user().onDelete((user) => {
  admin
    .firestore()
    .collection("users")
    .doc(user.uid)
    .delete()
    .then((res) => {
      console.log("User Deleted result:", res);
      return;
    })
    .catch((err) => {
      console.log(err);
      return;
    });
});

// Utility endpoint for testing
exports.calcDistances = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET" || !req.query.zips) {
    res.status(400).send("Invalid request");
    return;
  }

  const zips = req.query.zips.split(',');
  const allDists = {};

  for (const z of zips) {
    const fromCoord = await messageTemplates.zip2latlng(z);
    const facilities = await messageTemplates.doCalcDistances(admin, fromCoord, ['ads'], [ 5, 15 ]);

    const zipDists = {};
    for (const f in facilities) {
      for (const d in facilities[f]) {
        if (d !== 'collection') {
          (zipDists[d] = zipDists[d] || []).push(f);
        }
      }
    }

    if (Object.keys(zipDists).length > 0) {
      allDists[z] = zipDists;
    }
  }

  res.json(allDists).send();
});
