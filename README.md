# MegaPano + lupa (demo)

Visor 360 de una panorámica de muy alta resolución (18000×9000 px, servida como pirámide de tiles) con una lupa que sigue al cursor.
Hecho con [Photo Sphere Viewer](https://photo-sphere-viewer.js.org) 5 + three.js, sin build. Dependencias copiadas en `vendor/`.

- Arrastra para girar, rueda o `+`/`−` para zoom, pasa el cursor para ver la lupa (en celular, mantén el dedo).
- Atajos: `L` lupa on/off, `+`/`-` aumento de la lupa, `D` métricas de depuración.
- Notas de alcance, bugs y riesgos: [REPORTE.md](REPORTE.md). Pruebas funcionales: carpeta `test/`.

## Crédito de la imagen
Panorámica "St Etheldreda's Church Interior 360x180, London, UK" por David Iliff (Diliff), Wikimedia Commons,
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Aquí aparece reescalada a 16384×8192 y dividida en tiles;
esos tiles se comparten bajo la misma licencia CC BY-SA 3.0. Original: https://commons.wikimedia.org/wiki/File:St_Etheldreda%27s_Church_Interior_360x180,_London,_UK_-_Diliff.jpg
Para regenerar los tiles: descargar el original a `src/pano.jpg` y correr `python tile.py` (requiere Pillow).
