# PonelePlay TV Launcher (App Nativa para Android TV)

Aplicación nativa para **Smart TVs con Android TV / Google TV, Xiaomi Mi Box, Chromecast con Google TV y Fire TV Stick**.

---

## 📺 Características para el Salón

1. **Icono Nativo en el Launcher (Android Leanback):**
   - Incorpora banner horizontal 16:9 (`tv_banner`) para aparecer directamente en el carrusel principal de aplicaciones de la TV.
2. **Pantalla Siempre Activa (`FLAG_KEEP_SCREEN_ON`):**
   - Evita que el televisor o TV Box entre en reposo, apague la pantalla o active el salvapantallas durante el turno del bar.
3. **Reproducción Automática Sin Interacción (`mediaPlaybackRequiresUserGesture = false`):**
   - Permite que los videos musicales y audios de YouTube o catálogo se reproduzcan inmediatamente sin necesidad de clics manuales ni ratón.
4. **Pantalla Completa Inmersiva:**
   - Oculta automáticamente barras de estado y navegación del sistema operativo.
5. **Menú de Control Remoto:**
   - Si presionás el botón **Menú** o el botón **Atrás** en el control remoto de la TV, se abre un panel flotante para cambiar de bar (`venue_slug`), modificar la URL del servidor (`server_url`) o recargar la pantalla.

---

## 🚀 Cómo Instalar en la TV del Bar

### Método 1: Por Pendrive USB (El más rápido si tenés acceso físico a la TV)
1. Copiá el archivo `dist-apk/poneleplay-tv.apk` en un pendrive formateado en FAT32/NTFS.
2. Conectá el pendrive en el puerto USB del televisor o TV Box.
3. En la TV, abrí cualquier explorador de archivos (por ejemplo *File Commander* o *X-plore* desde Google Play).
4. Tocá sobre `poneleplay-tv.apk` y seleccioná **Instalar**.
5. ¡Listo! La app aparecerá en tus aplicaciones como **PonelePlay TV**.

---

### Método 2: Por Internet con la App "Downloader" (Sin cables)
1. En la Play Store de la Android TV, buscá e instalá la app **Downloader by AFTVnews**.
2. Subí el archivo `poneleplay-tv.apk` a tu servidor, a GitHub Releases o a un enlace directo (Dropbox/Drive).
3. Escribí la URL de descarga directa en Downloader y la app se instalará automáticamente.

---

## 🛠️ Cómo Compilar el APK Nuevamente

Requisitos: OpenJDK 17 y Android SDK 36.

```powershell
$env:JAVA_HOME = "C:\Users\TinChoX\.jdk17"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
cd android-tv
.\gradlew.bat assembleDebug
```

El archivo generado se guarda en:
`android-tv/app/build/outputs/apk/debug/app-debug.apk`
