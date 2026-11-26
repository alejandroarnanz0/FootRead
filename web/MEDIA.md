# Catálogo de identidad visual

El frontend sirve las imágenes desde `public/media/`. Las fichas se mantienen
en tres manifiestos de `src/media/catalog/` por tipo de entidad. Los recursos
están disponibles localmente con la aplicación. La descarga de un fichero
ausente y los enlaces de atribución requieren Internet.

## Correspondencias

| Entidad | Identificación | Si falta la imagen |
| --- | --- | --- |
| Jugador | ID de Transfermarkt y fecha de nacimiento ISO del registro | Iniciales |
| Club | ID único de Transfermarkt del club devuelto por la API | Escudo de Transfermarkt; si no existe, monograma |
| Selección | ID de Transfermarkt del catálogo de selecciones CSV | Escudo de Transfermarkt; si no existe, monograma |
| Equipo de un partido | ID de StatsBomb del encuentro, lado, competición, temporada y nombre exacto en `matchTeams.json` | Monograma |

MongoDB contiene 11.781 jugadores, 176 clubes y 5 competiciones según la consulta
de lectura de esta fase. No tiene colección de selecciones. El CSV original
contiene 124 selecciones y datos de ciudadanía y selección en el CSV de jugadores,
que el ETL no importa. Los retratos que no están en el catálogo local se muestran desde la URL `image_url`
de `players.csv` (servidores de Transfermarkt), guardada por el ETL en
`Player.imageUrl`; la silueta genérica (`default.jpg`) cuenta como sin foto.
Los escudos de clubes y selecciones sin fichero local se muestran desde
`https://tmssl.akamaized.net/images/wappen/head/<id>.png`, con el ID de
Transfermarkt del equipo; si esa imagen no existe, se ve el monograma.
Match conserva los nombres de los equipos. Los cruces verificados se basan en el
encuentro concreto y conservan la distinción entre club y selección.

## Fuentes y cobertura verificada

Se sirven 12 retratos, 15 escudos de club y 2 escudos de selección. Los 29
archivos locales ocupan alrededor de 1,11 MiB. Los escudos de clubes
verificados cubren 9 clubes de la competición alemana, 5 de la italiana y 1
de la francesa del catálogo.

- [FootyLogos, retratos](https://www.footylogos.com/player-pngs) organiza por
  jugador, club o selección, temporada, competición y pose. Indica resolución
  original y fondo, con PNG transparente o sólido. La ficha de ejemplo de
  Mbappé incluye 1080 × 1080. El sitio anuncia 11.356 jugadores de sus colecciones,
  sin equivalencia comprobada con los registros de Footboard. Los retratos
  tienen descarga individual y los [escudos](https://www.footylogos.com/packs)
  también tienen packs ZIP por edición en PNG y SVG cuando existe vector.
  Sus [condiciones](https://www.footylogos.com/logo-usage-right) conservan los
  derechos en los titulares. El crédito a FootyLogos identifica el índice.
  Quedaron sin verificar una API pública, IDs compatibles para un cruce masivo
  y el permiso para copiar y redistribuir sus archivos en el proyecto.
- [football-data.org](https://www.football-data.org/about) tiene IDs y API con
  registro y [límites de peticiones](https://docs.football-data.org/general/v4/policies.html).
  El acceso a las URLs no sustituye el permiso de terceros para retratos y
  escudos. Quedó descartado como origen de archivos.
- [TheSportsDB](https://www.thesportsdb.com/docs_terms_of_use.php) documenta una
  API para fotos y escudos con límites según plan. El permiso y la atribución
  deben comprobarse por imagen y las condiciones excluyen automatizar la web.
  Quedó sin verificar una cobertura reutilizable para el catálogo local.
- [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)
  documenta autoría, licencia y restricciones por archivo. Los metadatos y
  tamaños se consultan mediante su [API Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo).
  Se prioriza un retrato deportivo con buen encuadre, licencia trazable y una
  coincidencia de identidad comprobada. Los escudos se usan para identificar
  al equipo, conservando forma y color. La indicación de dominio público
  cubre el derecho de autor del archivo y las marcas siguen siendo de sus
  titulares. Los detalles por archivo se ven en `/credits`.

Lote de retratos cotejado contra ID de Transfermarkt y fecha en MongoDB:

| Muestra | Resultado |
| --- | --- |
| Mbappé, Lamine Yamal, Vinicius Junior, Bellingham, Pedri, Haaland, Salah | Retratos deportivos de Commons con licencia CC BY-SA. Se conserva Mbappé y se sustituye Lamine por un primer plano con España. Salah y Höler llevan indumentaria de entrenamiento o calentamiento. |
| Aimar Oroz, Josh Cullen, Lucas Höler, Olivier Giroud, Alessandro Buongiorno | Retratos deportivos identificados en Commons, con CC BY-SA o CC0. Las fotos de archivo pueden mostrar otra etapa del jugador. |
| Jon Moncayola, Jan Schöppner, Himad Abdelli, Riccardo Orsolini | Identidades comprobadas en el catálogo. Faltan retratos individuales con calidad, encuadre y reutilización verificables. Orsolini figura en una foto grupal. |

Real Madrid, FC Barcelona, CA Osasuna, Rayo Vallecano, Manchester City y Liverpool
se encontraron en FootyLogos. Para sus escudos actuales queda pendiente una
fuente con permiso verificable. Los escudos activados en Bundesliga, Serie A y
Ligue 1 figuran en `clubs.json` con enlace al archivo original y su declaración
de dominio público. España usa el emblema de la RFEF y San Marino el escudo
federativo de archivo. Francia y Argentina conservan monogramas. San Marino
no aparece en los partidos actuales de MongoDB y su escudo está disponible en
Créditos. El catálogo de replays usa el escudo de AC Milan y los detalles
verificados del Mundial 2022 utilizan el de España.

## Añadir o reconstruir recursos

1. Comprobar la identidad con un identificador externo existente. Para un
   jugador, comprobar también su fecha de nacimiento y que el retrato lo
   identifica. Para un escudo, comprobar su entidad y versión.
2. Revisar titular, licencia y restricciones en la ficha original. Conservar
   el enlace original, el autor, la URL de la licencia, la fecha cuando exista
   y las modificaciones indicadas por el archivo. Elegir una variante
   reducida cuando esté disponible. No construir URLs a partir de nombres.
3. Guardar un fichero pequeño en la carpeta del tipo. Añadir al manifiesto
   correspondiente `type`, `id`, `name`, `status: "verified"`, `verifiedOn`,
   `file`, `source`, `author`, `license`, `terms`, `download`, `sha256`,
   `bytes`, `width` y `height`. Los retratos requieren `birthDate`. Los
   campos `date`, `edits` y `restrictions` conservan contexto extra.
4. Para mostrar el escudo en un partido, añadir la correspondencia tras
   comprobar ambos catálogos. Evitar elegir por similitud de nombres.
5. Desde la raíz, ejecutar `node web/scripts/prepare-identity-assets.mjs`.
   Añadir `--download` para recuperar los archivos ausentes de las URL
   exactas revisadas de Commons. El script descarga en serie, evita
   duplicados y sólo guarda archivos con la huella esperada. Los SVG se
   guardan con finales de línea LF y sin espacios al final de cada línea.
   Si el origen devuelve otros bytes, revisar el archivo, la licencia y la
   huella antes de actualizar el catálogo.

En ejecución, el navegador solicita sólo los archivos de las filas visibles o
próximas a entrar en pantalla. Las fichas principales los piden inmediatamente.
La misma URL local permite reutilizar la caché entre páginas. Los espacios de
imagen mantienen su tamaño durante la carga y ante errores. Los escudos usan
encaje proporcional y los retratos se recortan visualmente sin deformación.
