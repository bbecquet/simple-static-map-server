const express = require('express');
const app = express();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;

app.use(function (req, res, next) {
  console.log(new Date().toISOString(), req.originalUrl);
  next();
});

// serve the page itself for internal use… beware of routing loops
app.use(express.static(__dirname + '/page'));

function parseMapStyles() {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(__dirname, 'mapstyles.json'), (error, json) => {
      if (error) reject(error);
      else resolve(JSON.parse(json));
    });
  });
}

function rasterTilesToStyle({ urls, tileSize = 256, minzoom = 0, maxzoom = 22 } = {}, attribution) {
  return {
    version: 8,
    sources: {
      rasters: {
        type: 'raster',
        tiles: urls,
        tileSize,
        attribution,
      },
    },
    layers: [
      {
        id: 'simple-tiles',
        type: 'raster',
        source: 'rasters',
        minzoom,
        maxzoom,
      },
    ],
  };
}

async function launchStyleTab(browser, { name, styleUrl, rasterTiles, attribution }) {
  console.log(` - ${name}`);
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/map.html`);

  const style = styleUrl || rasterTilesToStyle(rasterTiles, attribution);

  await page.evaluate(
    (style, attribution) => {
      map.setStyle(style);
      document.getElementById('attribution').innerHTML = attribution;
    },
    style,
    attribution
  );

  return { name, page };
}

async function launchBrowser(styles) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--headless', '--hide-scrollbars', '--mute-audio', '--use-gl=egl'],
  });
  console.log('Preparing tabs for styles…');
  return await Promise.all(styles.map(style => launchStyleTab(browser, style)));
}

const getPage = (tabs, styleName) => {
  let tab = tabs.find(tab => tab.name === styleName);
  if (!tab) {
    console.warn(`Unknown style name '${styleName}'. Fallback to first style '${tabs[0].name}'.`);
    tab = tabs[0];
  }
  return tab.page;
};

async function fetchPicture(page, { width, height, center, zoom, type, timeout }) {
  await page.setViewport({ width, height });
  const error = await page.evaluate(
    view => {
      document.body.classList.add('loading');
      try {
        // will throw an exception if center coordinates are invalid
        map.jumpTo(view);
        return null;
      } catch {
        document.body.classList.remove('loading');
        return 'Error, check the query parameters.';
      }
    },
    { zoom, center }
  );
  if (error) {
    return { error };
  }
  try {
    await page.waitForSelector('body.loading', { hidden: true, timeout });
  } catch {
    return { error: `Timeout exceeded (${timeout}ms)` };
  }
  const scrShot = await page.screenshot({ type }); // returns a Buffer
  return { buffer: scrShot };
}

const mimeTypes = {
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function parseQuery(query, styleNames) {
  return {
    width: Number(query.width) || 400,
    height: Number(query.height) || 400,
    zoom: Number(query.zoom) || 3,
    center: query.center ? query.center.split(',').map(Number) : [0, 0],
    type: Object.keys(mimeTypes).includes(query.type) ? query.type : 'png',
    style: query.style || styleNames[0],
    timeout: Number(query.timeout) || 30000,
  };
}

app.listen(port);

parseMapStyles()
  .then(launchBrowser)
  .then(tabs => {
    app.get('/map', (req, res) => {
      const styleNames = tabs.map(tab => tab.name);
      const params = parseQuery(req.query, styleNames);
      const tab = getPage(tabs, params.style);

      fetchPicture(tab, params).then(({ error, buffer }) => {
        if (error) {
          res.status(400).send(error);
        } else {
          res.contentType(mimeTypes[params.type]).end(buffer, 'binary');
        }
      });
    });

    app.get('/', (req, res) => {
      const home = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Static map server</title></head>
<body>
    <h1>Available map styles</h1>
    $$$STYLES$$$
</body>
</html>`;
      res
        .contentType('text/html; charset=UTF-8')
        .send(
          home.replace(
            '$$$STYLES$$$',
            `<ul>${tabs.map(tab => `<li>${tab.name}</li>`).join('')}</ul>`
          )
        );
    });
  })
  .then(() => {
    console.log('-----\nSite served on http://localhost:' + port + '\n-----');
  });
