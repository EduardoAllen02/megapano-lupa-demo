# MegaPano + lupa: reporte del esqueleto

Pano de prueba: St Etheldreda's Church (Diliff, Wikimedia Commons, CC BY-SA 3.0), 18000x9000 px, 49 MB.
Stack: Photo Sphere Viewer 5.15 + adapter de tiles equirectangulares + three.js. Sin build, solo ES modules.

## Cómo correrlo
    python -m http.server 8765      (en esta carpeta)  ->  http://localhost:8765
    Las pruebas conviene correrlas en un Chrome headless aparte (--headless=new --remote-debugging-port=9333): un mouse real sobre la pestaña las contamina.
    python tile.py                  (regenera tiles/ desde src/pano.jpg)
    node test/cdp.mjs open http://localhost:8765/index.html   (abre pestaña en Chrome con CDP 9222)
    node test/run.mjs               (16 pruebas de escritorio)
    node test/align.mjs && python -I test/align.py   (alineación por píxel a 1x)
    node test/touch.mjs             (emulación touch)

## Cómo está hecha la lupa
Un segundo visor PSV (circular, `pointer-events:none`) que sigue al cursor. Se le pone la dirección esférica bajo el cursor
(`viewerCoordsToSphericalCoords`) y un FOV calculado para dar N aumentos. Al ser un visor real, carga sus propios tiles
de máxima resolución, así que la lupa muestra detalle real y no píxeles estirados. Pirámide de tiles: 4096 / 8192 / 16384 px, tiles de 512 (26 MB en total).

## Resultados
Escritorio: 16/16 OK. Seguimiento del cursor, centrado exacto en el punto bajo el cursor, aumento efectivo 4.00x,
sigue bien tras pan y zoom con rueda, costura ±180°, zenit, apagar/ocultar, 60 FPS (p95 16.8 ms) moviendo la lupa.
Alineación por píxel a 1x (lupa vs. visor): diff medio 2-6/255 en centro, costura, zenit y nadir (resto = remuestreo).
Touch (emulado): lupa aparece, queda arriba del dedo y se mantiene dentro de pantalla, pan con un dedo y pinch-zoom OK.

## Bugs encontrados y corregidos durante el esqueleto
1. Aumento real 3.65x en vez de 4x: usé grados/píxel lineal; la proyección es tangente (con 100° de FOV se nota). Corregido.
2. PSV recorta `minFov` a 1° sin avisar; con 0.2 el mapeo zoom->FOV salía 2% desviado y la lupa desalineada. Corregido.
3. Sin `touch-action:none` el navegador móvil se queda con el gesto y cancela los eventos (la lupa desaparece al arrastrar). Corregido.
4. En touch la lupa se salía de pantalla cerca de bordes y el HUD tapaba la esquina. Corregido.

## Pendientes / riesgos abiertos (esto es lo que mueve el precio)
- Touch: solo probado en emulación (pan con un dedo, pinch, lupa dentro de pantalla: OK en Chrome headless aislado). Las fallas intermitentes que vi antes eran interferencia del mouse real sobre la pestaña compartida. Falta probar en celulares reales (iOS Safari y Android).
- Dos contextos WebGL a la vez (visor + lupa). En móviles de gama baja/iOS puede haber límite de memoria de texturas. No medido. Plan B: una sola cámara/render con shader.
- Límite de resolución: a 4x la lupa aprovecha el detalle, a 16x ya son 5 px de pantalla por texel (borroso). Hay que topar el aumento según la resolución real de la pano del cliente.
- Fuera del centro del visor la lupa difiere del visor por diseño (la lupa mira recto al punto; el visor lo ve en perspectiva oblicua). Con aumentos altos no se nota.
- Efecto de vidrio: aquí es CSS (borde, sombra, brillo). El shader del cliente (refracción + aberración cromática) no está replicado.
- Pirámide de tiles: hecha con Pillow cargando la imagen entera en RAM. Para una MegaPano de gigapíxeles hay que usar libvips/streaming y definir hosting/CDN (miles de tiles).
- Al mover la lupa rápido se ve brevemente el nivel de baja resolución mientras llegan los tiles L2 (no medido el tiempo exacto).
- Sin probar: navegadores distintos a Chrome, pantallas retina/DPR alto, teclado/accesibilidad, múltiples panos, carga en red lenta.
