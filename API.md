# Map API

### `pins`

```
[
  {
    "id": "9867E09AB115",
    "type": 0,
    "title": "DRK-Blutspendedienst Nord-Ost",
    "latLng": [ 47.50745779304866, 10.274544954299929 ]
  },
  ...
]
```

Beispiel: https://immunhelden.de/map/pins

### `regions`

```
{
  "81735": [
    "098A6EFF789", // IDs
    "F890EEFCC23"
  ],
  ...
}
```

Beispiel: https://immunhelden.de/map/regions

### `details_html?id=<ID>`

```
<div>
  <h2>Titel</h2>
  <b>Wo?</b>
  <p>Adresse</p>
  <b>Was kann ich tun?</b>
  <p>Beschreibung</p>
  <!-- dein Kontaktformular -->
</div>
```

Beispiel: https://immunhelden.de/map/details_html?id=-M3mVHBAWkbnuve2C4SC
