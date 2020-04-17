# Required API Endpoints

### `pins`

This request is issued on load and retrieves the position of all pins to display on the map. When the user selects a pin, further information will be fetched for the respective `key` via `details_html`. There are no filter parameters yet. Pins have a minimal set of properties.

| Property | Description |
| ---- | ---- |
| `latlng`<br>(Array) | Coordinates on the map as Float values |
| `type`<br>(Index) | Index into the Array of pin image URLs (see `pin_imgs`). Determines the image used to display the pin. May also be used for filters in the future.  |
| `title`<br>(String) | Minmal info text displayed to the user without fetching further data |

Example:

```

{
  "9867E09AB115": { // ID == key
    "type": 0,
    "title": "DRK-Blutspendedienst Nord-Ost",
    "latlng": [ 47.50745779304866, 10.274544954299929 ]
  },
  ...
}
```

Reference: https://immunhelden.de/map/pins

### `regions`

This request is issued on load and retrieves a set of `id`s per region to display on the map. When the user selects a region, further information will be fetched for all its `id`s via `details_html`. There are no filter parameters yet. As of now, a region is identified by the German Postleitzahl. The display on the map may combine them into larger chunks depending on the zoom level.

Example:
```
{
  "81735": [
    "098A6EFF789", "F890EEFCC23" // IDs
  ],
  ...
}
```

Reference: https://immunhelden.de/map/regions

### `details_html?ids=id1,id2,id3,...`

This request is issued whenever the user asks for more details on one of your items. The result should be a piece of HTML markup to show in a popup or seperate section on the map. Assume a bright background and basic style settings being given for ordinary HTML elements.

| Parameter | Description |
| ---- | ---- |
| `ids` | Comma seperated list of IDs to provide detailed information |

Note that you can display contact information here directly (if you have the consent of your users) or embed your own contact form!

Example:
```
<div>
  <h2>Title</h2>
  <b>Where?</b>
  <p>Address</p>
  <b>What can I do?</b>
  <p>Description</p>
  <form action="your_inbox" method="POST">
    <input type="hidden" name="key" value="098A6EFF789">
    <textarea rows="3" name="message" required placeholder="Say hello">
    </textarea>
    <input type="text" name="contact" required placeholder="Contact">
    <input type="submit" value="Go">
  </form>
</div>
<hr>
<div>
  <h2>Another item</h2>
  ...
</div>
```

Reference: https://immunhelden.de/map/details_html?ids=-M3mVHBAWkbnuve2C4SC,-M3mY_6ZBcxv9ogclXsg,-M3l7gQOTb0crfvz5aLN,-M3l8GxpHehFl3Gyklfz

### `pin_imgs` (optional)

This request is issued on load and retrieves aa Array of image URLs that will be used for pins.

_TODO_

## Dev notes

The map works out-of-the-box when served via HTTP request. When working on the map implementation, however, it it's useful to just open the HTML file from your filesystem. There are two issues that you want to walk around.

#### (1) `Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at https://immunhelden.de/map/pins. (Reason: CORS header ‘Access-Control-Allow-Origin’ missing).`

The differing prefixes `file://` vs. `https://` are the problem here. For development, use a Chrome browser and disable CORS security features. On macOS you can do:

```
% open /Applications/Google\ Chrome.app --args --user-data-dir="/tmp/ChromeDevSession" --disable-web-security &
```

#### (2) `jquery.min.js:4 GET file:///map/pins net::ERR_FILE_NOT_FOUND`

The `/map/pins` endpoint doesn't exist in your filesystem. For development, pass the `baseUrl` parameter for your platform, e.g.:

```
file:///your/local/path/to/map_genapi.html?baseUrl=https://immunhelden.de
```
