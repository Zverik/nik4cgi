# CGI interface to Nik4

This is exactly what you think it is: a web interface to Nik4. Instead of typing bounds by hand,
just select a rectangle on an interactive map, choose paper format, image type, and press "Submit.
You'll get a fresh map image in 300 dpi, not dependent on stale tiles and overloaded osm.org.

There is a demo instance at http://tile.osmz.ru/get/index.en.html

## Installation

Copy all files from `www` directory into some apache's document root subdirectory. Then copy
files from `cgi-bin` into directory for CGI scripts. Fix the path to `nik4cgi.py` in `index*.html`.
Note that `index.html` is in Russian: you may want to rename `index.en.html` or create
a version in your language.

You would need [Nik4](https://github.com/Zverik/Nik4) and probably [OSM Carto](https://github.com/gravitystorm/openstreetmap-carto)
style: for the latter you would need to run `get-shapefiles.sh` and then generate XML:
run `npm install carto; carto -l project.mml > osm.xml`.

I assume you already have PostGIS and Mapnik installed, and OSM data loaded in a database.
An apache user might not have access to the database. There are two ways to fix this. First
is to start `psql gis` (assuming database is "gis") as `postgres` user and run:

```sql
CREATE USER apache;
GRANT CONNECT ON DATABASE gis TO apache;
GRANT USAGE ON SCHEMA public TO apache;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO apache;
```

Or simplier, especially if your apache user is "www-data", just allow user that has reading
rights access without password, adding `local gis username trust` to `pg_hba.conf` and
adding user name to XML style:

    sed -i 's/\(<Parameter name="dbname\)/<Parameter name="user">username<\/Parameter>\1/' style.xml

Then correct layers and paths in `cgi-bin/cfg.py`. You may have to correct layers array in
`www/getveloroad.js`. Finally, adjust `bounds.geojson` in `www` directory to your data bounds,
or remove the relevant line from `www/getveloroad.js`. Now, open the page and try generating an image.

## Route layer

This is how a GPX trace layer is added to Veloroad style:

```xml
<Style name="route" filter-mode="first">
  <Rule>
    <MinScaleDenominator>750000</MinScaleDenominator>
    <LineSymbolizer stroke-width="4" stroke="#012d64" stroke-linejoin="round" stroke-linecap="round" />
  </Rule>
  <Rule>
    <MaxScaleDenominator>750000</MaxScaleDenominator>
    <LineSymbolizer stroke-width="5" stroke="#012d64" stroke-linejoin="round" stroke-linecap="round" />
  </Rule>
</Style>
<Layer name="route" status="off" srs="+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs">
  <StyleName>route</StyleName>
  <Datasource>
     <Parameter name="type">ogr</Parameter>
     <Parameter name="file">${route:/home/username/whatever/route.gpx}</Parameter>
     <Parameter name="layer">tracks</Parameter>
     <Parameter name="all_layers">route_points,routes,track_points,waypoints</Parameter>
  </Datasource>
</Layer>
```

Just paste this code into your XML; this works even for OSM Carto style (I put it before "nepopulated" layer).
Note that the path to `route.gpx` should be correct, though it won't be used for rendering.

## Author and License

Most files here were written by Ilya Zverev and published under WTFPL license.

Web page contains code from [Leaflet.draw](https://github.com/Leaflet/Leaflet.draw)
and [Leaflet.FileLayer](https://github.com/makinacorpus/Leaflet.FileLayer) plugins and
[togeojson](https://github.com/mapbox/togeojson) by MapBox.
